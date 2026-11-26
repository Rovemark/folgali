// The PAGES of revision 0.3.2 really mounted on top of the demo client, and of the same client "as relay 0.3.1" (without the 4 new resources):
// the new screen appears with the new relay and goes away, without breaking, with the old relay.
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/social-actions', () => ({ actAction: vi.fn(), moreAction: vi.fn(), proposeAction: vi.fn(), markNoticesSeenAction: vi.fn(async () => undefined) }))
vi.mock('@/app/actions', () => ({ reactAction: vi.fn(), deleteAction: vi.fn(), followAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { FakeClient } from '@/lib/fake-client'
import { COMMUNITIES, TOPICS } from '@/lib/social/demo-ids'

let current: FakeClient
vi.mock('@/lib/get-network', () => ({ getNetwork: () => ({ cliente: current, ponte: current }) }))

import Timeline from '@/app/[lang]/linha/page'
import Search from '@/app/[lang]/buscar/page'
import CommunityPage from '@/app/[lang]/comunidades/[id]/page'
import TopicPage from '@/app/[lang]/t/[id]/page'
import Marks, { TagChip } from '@/components/communities/Brands'
import RelayAnnouncements from '@/components/RelayAnnouncements'
import { dict } from '@/lib/i18n'

const CLOCK = new Date('2026-11-05T15:00:00.000Z')
/** The same client, pretending to be a 0.3.1 relay: no 0.3.2 resource and nothing that it adds to the responses. */
function asRelay031(c: FakeClient) {
  const x = Object.create(c) as FakeClient
  x.suporta = async (r) => !['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios'].includes(r) && c.suporta(r)
  x.anuncios = async () => ({ itens: [] })
  const community = c.comunidade.bind(c)
  x.comunidade = async (id: string) => {
    const k = (await community(id)) as unknown as Record<string, unknown>
    delete k.vocabulario
    return k as never
  }
  const topics = c.topicos.bind(c)
  x.topicos = async (id, o) => {
    const l = await topics(id, o)
    const without = <T extends object>(t: T) => { const n = { ...t } as Record<string, unknown>; delete n.marcas; return n as T }
    return { ...l, itens: l.itens.map(without), fixados: l.fixados?.map(without) }
  }
  return x
}
const lang = { lang: 'pt' }
const renderScreen = async (jsx: Promise<React.ReactElement>) => render(await jsx)
const links = (name: string) => within(screen.getByRole('navigation', { name: name })).getAllByRole('link').map((a) => a.textContent)

beforeEach(() => {
  current = new FakeClient(() => CLOCK)
})

describe('community conversation list', () => {
  const openAction = (sp: Record<string, string> = {}, id = COMMUNITIES.cinema) => renderScreen(CommunityPage({ params: Promise.resolve({ ...lang, id }), searchParams: Promise.resolve(sp) }))
  it('with relay 0.3.2 there are Best and Trending; the note says the count is of people; trending carries the period', async () => {
    await openAction({ ordem: 'em-alta', janela: '7d' })
    expect(links('Ordem das conversas')).toEqual(['Recentes', 'Ativas', 'Sem resposta', 'Melhores', 'Em alta'])
    expect(screen.getByText(/contam pessoas diferentes, nunca vezes/)).toBeInTheDocument()
    const period = screen.getByRole('group', { name: 'Período do Em alta' })
    expect(within(period).getByText('7 dias')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Em alta' })).toHaveAttribute('aria-current', 'page')
  })
  it('in Recent there is no note or period', async () => {
    await openAction()
    expect(screen.queryByText(/contam pessoas diferentes/)).toBeNull()
    expect(screen.queryByRole('group', { name: 'Período do Em alta' })).toBeNull()
  })
  it('a hand-written address with order by people on an old relay falls back to Recent, without the new links', async () => {
    current = asRelay031(current)
    await openAction({ ordem: 'melhores' })
    expect(links('Ordem das conversas')).toEqual(['Recentes', 'Ativas', 'Sem resposta'])
    expect(screen.getByRole('link', { name: 'Recentes' })).toHaveAttribute('aria-current', 'page')
  })
  it('status and label chips, with a filter; the selected status stays marked and the empty one has its own text', async () => {
    await openAction({ status: 'respondido' })
    const st = screen.getByRole('group', { name: 'Status' })
    expect(within(st).getAllByRole('link').map((a) => a.textContent?.replace('Status:', ''))).toEqual(['Todas', 'Aberto', 'Respondido', 'Encerrado'])
    expect(within(st).getByText('Respondido').closest('a')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('group', { name: 'Etiquetas' })).toBeInTheDocument()
    expect(screen.getAllByText('Calendário').length).toBeGreaterThan(0)
  })
  it('a filter with no result says "Nada com essa marca"', async () => {
    await openAction({ status: 'aberto', etiqueta: 'calendario' })
    expect(screen.getByText('Nada com essa marca')).toBeInTheDocument()
  })
  it('a key the community does not have in its vocabulary is ignored (becomes no filter)', async () => {
    await openAction({ status: 'inventado', etiqueta: '<script>' })
    expect(screen.queryByText('Nada com essa marca')).toBeNull()
  })
  it('old relay: no chips and no marks', async () => {
    current = asRelay031(current)
    await openAction()
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Etiquetas' })).toBeNull()
  })
  it('a community without its own vocabulary shows the default status', async () => {
    await openAction({}, COMMUNITIES.tabuleiro)
    const st = screen.getByRole('group', { name: 'Status' })
    expect(within(st).getByText('Em andamento')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Etiquetas' })).toBeNull()
  })
  it('in English the labels are the English ones', async () => {
    await renderScreen(CommunityPage({ params: Promise.resolve({ lang: 'en', id: COMMUNITIES.cinema }), searchParams: Promise.resolve({}) }))
    expect(links('Order of conversations')).toContain('Trending')
  })
})

describe('topic page', () => {
  const openAction = (sp: Record<string, string> = {}, id = TOPICS.cinemaPopcorn) => renderScreen(TopicPage({ params: Promise.resolve({ ...lang, id }), searchParams: Promise.resolve(sp) }))
  it('shows the status and the labels resolved by the community\'s vocabulary', async () => {
    await openAction()
    expect(screen.getByText('Respondido')).toBeInTheDocument()
    expect(screen.getByText('Expediente')).toBeInTheDocument()
  })
  it('reply order: chronological by default, Best and Trending as links, and the marked one stays marked', async () => {
    await openAction({ ordem: 'melhores' })
    expect(links('Ordem das respostas')).toEqual(['Cronológica', 'Melhores', 'Em alta'])
    expect(screen.getByRole('link', { name: 'Melhores' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Cronológica' })).toHaveAttribute('href', `/pt/t/${TOPICS.cinemaPopcorn}#respostas-t`)
    expect(screen.getByRole('link', { name: 'Melhores' })).toHaveAttribute('href', `/pt/t/${TOPICS.cinemaPopcorn}?ordem=melhores#respostas-t`)
  })
  it('trending on the topic carries the period and the 7-day link carries the window', async () => {
    await openAction({ ordem: 'em-alta', janela: '7d' })
    expect(within(screen.getByRole('group', { name: 'Período do Em alta' })).getByText('7 dias')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('24 horas')).toHaveAttribute('href', `/pt/t/${TOPICS.cinemaPopcorn}?ordem=em-alta#respostas-t`)
  })
  it('old relay: no selector and no mark', async () => {
    current = asRelay031(current)
    await openAction({ ordem: 'melhores' })
    expect(screen.queryByRole('navigation', { name: 'Ordem das respostas' })).toBeNull()
    expect(screen.queryByText('Respondido')).toBeNull()
  })
})

describe('topic search', () => {
  const openAction = (sp: Record<string, string>) => renderScreen(Search({ params: Promise.resolve(lang), searchParams: Promise.resolve({ q: 'calendario', tipo: 'topicos', ...sp }) }))
  it('with relay 0.3.2 it offers the order; without it, no', async () => {
    await openAction({ ordem: 'recentes' })
    expect(links('Ordem dos tópicos')).toEqual(['Mais parecidos', 'Mais novos', 'Melhores', 'Em alta'])
    expect(screen.getByRole('link', { name: 'Mais novos' })).toHaveAttribute('aria-current', 'page')
  })
  it('old relay: no selector', async () => {
    current = asRelay031(current)
    await openAction({ ordem: 'recentes' })
    expect(screen.queryByRole('navigation', { name: 'Ordem dos tópicos' })).toBeNull()
  })
  it('the order does not appear on the other tabs', async () => {
    await openAction({ tipo: 'rovers' })
    expect(screen.queryByRole('navigation', { name: 'Ordem dos tópicos' })).toBeNull()
  })
})

describe('relay announcements on the home page', () => {
  it('the card appears with the pinned one and the other; it has the plain-text note', async () => {
    await renderScreen(Timeline({ params: Promise.resolve(lang) }))
    const sec = screen.getByRole('region', { name: 'Do relé' })
    expect(within(sec).getByText('Como a rede ordena as conversas')).toBeInTheDocument()
    expect(within(sec).getByText('O relé agora fala a revisão 0.3.2')).toBeInTheDocument()
    expect(within(sec).getByText('Fixado')).toBeInTheDocument()
    expect(within(sec).getByText(/Texto puro, escrito por quem opera o relé/)).toBeInTheDocument()
  })
  it('old relay: no card', async () => {
    current = asRelay031(current)
    await renderScreen(Timeline({ params: Promise.resolve(lang) }))
    expect(screen.queryByRole('region', { name: 'Do relé' })).toBeNull()
  })
  it('the announcement text is text: markup and links do not become elements', () => {
    const a = { id: 'an_AAAAAAAAAAAAAAAAAAAAAA', titulo: '<b>Aviso</b>', texto: '<img src=x onerror=alert(1)> [link](http://x.com) http://x.com', criadoEm: CLOCK.toISOString(), fixado: false }
    const { container } = render(<RelayAnnouncements itens={[a]} d={dict('pt')} agora={CLOCK.toISOString()} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
  it('only the pinned one carries the "Fixado" badge; the publication date comes out filled in, without the text\'s mark', () => {
    const base = { id: 'an_AAAAAAAAAAAAAAAAAAAAAA', titulo: 'T', texto: 'curto', criadoEm: new Date(CLOCK.getTime() - 2 * 3600_000).toISOString() }
    const { container } = render(<RelayAnnouncements itens={[{ ...base, fixado: true }, { ...base, id: 'an_BBBBBBBBBBBBBBBBBBBBBB', fixado: false }]} d={dict('pt')} agora={CLOCK.toISOString()} />)
    expect(screen.getAllByText('Fixado')).toHaveLength(1)
    const items = container.querySelectorAll('li.announcement')
    expect(items[0].querySelector('.pill')).not.toBeNull()
    expect(items[1].querySelector('.pill')).toBeNull()
    expect(container.textContent).not.toContain('{quando}')
    expect(container.textContent).toMatch(/publicado há 2 h|publicado há 2 horas/)
  })
  it('a long announcement sits behind "Ler o anúncio inteiro"; a short one appears open; an empty list draws nothing', () => {
    const base = { id: 'an_AAAAAAAAAAAAAAAAAAAAAA', titulo: 'T', criadoEm: CLOCK.toISOString(), fixado: false }
    const { container, unmount } = render(<RelayAnnouncements itens={[{ ...base, texto: 'x'.repeat(241) }]} d={dict('pt')} agora={CLOCK.toISOString()} />)
    expect(container.querySelector('details')).not.toBeNull()
    unmount()
    const r2 = render(<RelayAnnouncements itens={[{ ...base, texto: 'x'.repeat(240) }]} d={dict('pt')} agora={CLOCK.toISOString()} />)
    expect(r2.container.querySelector('details')).toBeNull()
    r2.unmount()
    expect(render(<RelayAnnouncements itens={[]} d={dict('pt')} agora={CLOCK.toISOString()} />).container.innerHTML).toBe('')
  })
})

describe('chips', () => {
  const vocab = { etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' as const }], status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde' as const, categorias: null }], padrao: false }
  it('the color goes in data-cor, the status carries a label for the screen reader, and a key without vocabulary does not become code on the screen', () => {
    const { container } = render(<Marks marcas={{ etiquetas: ['bug', 'sumiu'], status: 'aberto' }} vocabulario={vocab} d={dict('pt')} />)
    expect(container.querySelector('[data-tipo="status"]')).toHaveAttribute('data-cor', 'verde')
    expect(container.querySelector('[data-tipo="status"] .reader-only')).toHaveTextContent('Status:')
    expect(container.querySelector('[data-tipo="etiqueta"]')).toHaveAttribute('data-cor', 'vermelho')
    expect(container.textContent).not.toContain('sumiu')
  })
  it('without vocabulary or without a mark draws nothing; a color outside the list becomes gray', () => {
    expect(render(<Marks marcas={{ etiquetas: ['bug'], status: null }} d={dict('pt')} />).container.innerHTML).toBe('')
    expect(render(<Marks vocabulario={vocab} d={dict('pt')} />).container.innerHTML).toBe('')
    const { container } = render(<TagChip e={{ chave: 'x1', rotulo: 'X', cor: 'dourado' as never }} />)
    expect(container.querySelector('.vocab-chip')).toHaveAttribute('data-cor', 'cinza')
  })
})
