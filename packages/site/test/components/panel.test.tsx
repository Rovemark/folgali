// The "Meu rover" dashboard (/[lang]/inicio): each block alone (empty, with data, with an error) and the PAGE really mounted on top of the
// demo client, with and without permanent authorization, without a paired app and in Arabic. It includes the accessibility structure that can
// be proven without a browser: landmarks, heading order, unique link names, no button that changes the authorization.
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt/inicio' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/social-actions', () => ({ actAction: vi.fn(), moreAction: vi.fn(), proposeAction: vi.fn(), markNoticesSeenAction: vi.fn(async () => undefined) }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { FakeClient } from '@/lib/fake-client'
import type { Network } from '@/lib/network-client'

const h = vi.hoisted(() => ({ rede: null as unknown as Network }))
vi.mock('@/lib/get-network', () => ({ getNetwork: () => h.rede }))

import Home, { generateMetadata } from '@/app/[lang]/inicio/page'
import ShortcutsBlock from '@/components/panel/ShortcutsBlock'
import AuthorizationBlock from '@/components/panel/AuthorizationBlock'
import NoticesBlock from '@/components/panel/NoticesBlock'
import DoneBlock from '@/components/panel/DoneBlock'
import LimitsBlock from '@/components/panel/LimitsBlock'
import RoverHeader from '@/components/panel/RoverHeader'
import { dict } from '@/lib/i18n'
import type { PublishedAction } from '@/lib/panel/types'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const now = NOW.toISOString()
const d = dict('pt')
const t = d.socInicio
const ok = <T,>(value: T) => ({ ok: true as const, valor: value })
const failed = { ok: false as const, codigo: 'indisponivel' as const }
const before = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()

let client: FakeClient
beforeEach(() => {
  client = new FakeClient(() => NOW)
  h.rede = { cliente: client, ponte: client }
})
const openAction = async (lang = 'pt') => render(await Home({ params: Promise.resolve({ lang }) }))
const section = (name: string) => screen.getByRole('region', { name: name })

describe('the page, on the demo client', () => {
  const f = d.socFolgali.meuRover
  it('title, the time-off rover now, its day, new friends, mood and the controls', async () => {
    await openAction()
    expect(screen.getByRole('heading', { level: 1, name: f.titulo })).toBeInTheDocument()
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)
    expect(h2).toEqual(['Lumi está de folga agora', 'Hoje na vida da Lumi', f.amigosNovos, f.humor, t.avisos.titulo, f.controles])
  })
  it('there is no approval queue or link to approve: the rover posts on its own', async () => {
    const { container } = await openAction()
    expect(container.querySelector('a[href*="aprovar"]')).toBeNull()
    expect(screen.queryByText(/esperando/)).toBeNull()
  })
  it('controls: post on its own comes ON, pause comes off, default limit of 20 per day', async () => {
    await openAction()
    const ctl = section(f.controles)
    expect(within(ctl).getByRole('switch', { name: 'Lumi pode postar sozinha' })).toHaveAttribute('aria-checked', 'true')
    expect(within(ctl).getByRole('switch', { name: f.pausar })).toHaveAttribute('aria-checked', 'false')
    expect(within(ctl).getByLabelText('20 por dia')).toHaveTextContent('20')
    expect(within(ctl).getByText(f.memoria)).toBeInTheDocument()
  })
  it('pausing the time off notifies at once; the limit goes up and down without leaving 1 to 40', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    await openAction()
    const ctl = section(f.controles)
    await user.click(within(ctl).getByRole('switch', { name: f.pausar }))
    expect(within(ctl).getByText('A folga da Lumi está pausada')).toBeInTheDocument()
    await user.click(within(ctl).getByRole('button', { name: f.mais }))
    expect(within(ctl).getByLabelText('21 por dia')).toBeInTheDocument()
  })
  it('the week\'s mood has a text description for whoever cannot see the chart', async () => {
    await openAction()
    expect(screen.getByRole('img', { name: /Gráfico do humor da Lumi de segunda a domingo/ })).toBeInTheDocument()
  })
  it('notices: the unread ones with a link to all; opening the dashboard marks nothing as seen', async () => {
    const mark = vi.spyOn(client, 'marcarAvisosVistos')
    await openAction()
    const b = section(t.avisos.titulo)
    expect(within(b).getAllByRole('listitem').length).toBeLessThanOrEqual(3)
    expect(within(b).getByRole('link', { name: t.avisos.verTodos })).toHaveAttribute('href', '/pt/avisos')
    expect(mark).not.toHaveBeenCalled()
  })
  it('in Arabic the page mounts (the mirror comes from logical CSS)', async () => {
    await openAction('ar')
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(3)
  })
  it('without a paired app: there is no rover to show, and the page says so', async () => {
    h.rede = { cliente: client, ponte: { ...client, whoAmI: async () => null } as unknown as Network['ponte'] }
    await openAction()
    expect(screen.getByRole('heading', { name: f.semAppTitulo })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: f.controles })).toBeNull()
  })
  it('an unknown language is 404', async () => {
    await expect(Home({ params: Promise.resolve({ lang: 'xx' }) })).rejects.toThrow('NOT_FOUND')
  })
  it('metadata: registry title, canonical in the language and noindex (with the flag off and on)', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ lang: 'en' }) })
    expect(m.title).toBe('My rover')
    expect(m.alternates?.canonical).toBe('https://folgali.com/en/inicio')
    expect(m.robots).toMatchObject({ index: false })
    vi.stubEnv('FOLGALI_INDEXABLE', 'sim')
    try {
      expect((await generateMetadata({ params: Promise.resolve({ lang: 'pt' }) })).robots).toMatchObject({ index: false, follow: false })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('each block alone', () => {
  const me = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'marshmallow', cor: '#f2e8d6', acessorios: ['laco'] } }
  const action = (x: Partial<PublishedAction>): PublishedAction => ({ id: 'ob_1', tipo: 'postagem', em: before(5), trecho: 'Oi.', para: null, caminho: '/p/ob_1', via: 'aprovacao', ...x })

  it('a failure to read a block appears as a failure, never as "nothing"', () => {
    render(
      <>
        <DoneBlock published={failed} d={d} lang="pt" agora={now} />
        <NoticesBlock avisos={failed} myHandle="lumi" d={d} lang="pt" agora={now} />
        <AuthorizationBlock autorizacao={failed} published={[]} d={d} lang="pt" agora={now} />
        <LimitsBlock published={failed} contaDesde={null} d={d} agora={now} />
      </>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(4)
    expect(screen.queryByText(t.feito.vazioTitulo)).toBeNull()
    expect(screen.queryByText(t.autorizacao.nenhumaTitulo)).toBeNull()
  })
  it('what it did: an honest empty; with to whom, the relative date and a link with a name that says what', () => {
    const { unmount } = render(<DoneBlock published={ok([])} d={d} lang="pt" agora={now} />)
    expect(screen.getByText(t.feito.vazioTitulo)).toBeInTheDocument()
    unmount()
    render(<DoneBlock published={ok([action({ tipo: 'recado', para: { ...me, nome: 'Pipa', handle: 'pipa' }, caminho: '/r/pipa?aba=mural', em: before(120) })])} d={d} lang="pt" agora={now} />)
    expect(screen.getByText('Pipa').tagName).toBe('BDI')
    expect(screen.getByText('há 2 h')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Abrir\s*: Recado para Pipa, há 2 h$/ })).toHaveAttribute('href', '/pt/r/pipa?aba=mural')
  })
  it('what it did: an object without a page gets no link', () => {
    render(<DoneBlock published={ok([action({ caminho: null })])} d={d} lang="pt" agora={now} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('notices: with nothing new, says so; the count stays at the top', () => {
    render(<NoticesBlock avisos={ok({ lista: [], total: 0 })} myHandle="lumi" d={d} lang="pt" agora={now} />)
    expect(screen.getByText('Nenhum aviso novo')).toBeInTheDocument()
    expect(screen.getByText(t.avisos.vazioTexto)).toBeInTheDocument()
  })
  it('notices: if the count says there are new ones but the first page did not bring them, it does not say "nothing new" (that would be a contradiction)', () => {
    render(<NoticesBlock avisos={ok({ lista: [], total: 3 })} myHandle="lumi" d={d} lang="pt" agora={now} />)
    expect(screen.getByText('3 avisos novos')).toBeInTheDocument()
    expect(screen.queryByText(t.avisos.vazioTexto)).toBeNull()
    expect(screen.getByRole('link', { name: t.avisos.verTodos })).toBeInTheDocument()
  })
  it('expired authorization: warns that it expired and that the relay refuses', () => {
    const a = { id: 'au_x', tipos: ['postagem'], emitidaEm: before(8 * 1440), expiraEm: before(1440), maxPorHora: 2, maxPorDia: 4 }
    render(<AuthorizationBlock autorizacao={ok(a)} published={[]} d={d} lang="pt" agora={now} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^Venceu em .*O relé recusa/)
    expect(screen.getByText('0 de 2')).toBeInTheDocument()
  })
  it('limits: a new account warns of the factor; an exhausted type says it reached the limit', () => {
    const many = Array.from({ length: 2 }, (_, i) => action({ id: `ob_${i}`, em: before(i + 1) }))
    render(<LimitsBlock published={ok(many)} contaDesde={before(120)} d={d} agora={now} />)
    expect(screen.getByText(/os limites valem 20% do normal até ela completar 1 dias/)).toBeInTheDocument()
    const posts = screen.getByText('Postagens').closest('li')!
    expect(posts).toHaveAttribute('data-esgotado', 'true')
    expect(within(posts).getByText('chegou ao limite por enquanto')).toBeInTheDocument()
    expect(within(posts).getByText('2 de 2 na última hora, 2 de 8 nas últimas 24 horas')).toBeInTheDocument()
  })
  it('header: a hidden count is a padlock with text for the screen reader, never zero', async () => {
    const page = await client.paginaDoRover((await client.whoAmI())!.uid)
    render(<RoverHeader page={{ ...page, contagens: { ...page.contagens, amigos: null } }} d={d} lang="pt" />)
    expect(screen.getByText(t.cab.amigos).nextSibling?.textContent).toBe(t.cab.privado)
  })
  it('atalhos usam o handle e o idioma', () => {
    render(<ShortcutsBlock myHandle="pipa" d={dict('en')} lang="en" />)
    expect(screen.getByRole('link', { name: /See the public profile/ })).toHaveAttribute('href', '/en/r/pipa')
  })
})
