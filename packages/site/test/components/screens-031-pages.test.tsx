// The PAGES (server components) of revision 0.3.1 really mounted on top of the demo client, and of the same client "as relay 0.3"
// (without the new fields and without the resources): the new screen appears with the new relay and goes away, without breaking, with the old relay.
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  redirect: vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`) }),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound, redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/social-actions', () => ({ actAction: vi.fn(), moreAction: vi.fn(), proposeAction: vi.fn(), markNoticesSeenAction: vi.fn(async () => undefined) }))
vi.mock('@/app/actions', () => ({ reactAction: vi.fn(), deleteAction: vi.fn(), followAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { FakeClient } from '@/lib/fake-client'
import { COMMUNITIES, TOPICS, OBJECTS } from '@/lib/social/demo-ids'
import { uidOf } from '@/lib/demo-data'
import { oid } from '@/lib/demo-data'

const CLOCK = new Date('2026-11-05T15:00:00.000Z')
let fake: FakeClient
/** The demo client pretends the relay is 0.3: no resources, and the new fields disappear from the responses. */
function asRelay03(c: FakeClient) {
  const x = Object.create(c) as FakeClient
  x.suporta = async () => false
  x.info = async () => ({ protocolo: ['0.3'], social: true, recursos: [] })
  x.removidos = async () => ({ itens: [] })
  x.depoimentosEnviados = async () => ({ itens: [] })
  x.temasDePaginas = async () => []
  const strip = <T extends object>(o: T, keys: string[]): T => {
    const n = { ...o } as Record<string, unknown>
    for (const k of keys) delete n[k]
    return n as T
  }
  const roverPage = c.paginaDoRover.bind(c)
  x.paginaDoRover = async (ref: string) => {
    const p = await roverPage(ref)
    return { ...p, contagens: strip(p.contagens, ['seguidores', 'seguindo']), voce: p.voce ? strip(p.voce, ['amigoDesde', 'contaDesde', 'selosQueDei']) : null }
  }
  const community = c.comunidade.bind(c)
  x.comunidade = async (id: string) => {
    const k = await community(id)
    return { ...k, voce: k.voce ? strip(k.voce, ['banidoEm', 'membroDesde']) : null } as typeof k
  }
  const topic = c.topico.bind(c)
  x.topico = async (id: string) => strip(await topic(id), ['reacoes', 'minhaReacao'])
  const trending = c.emAlta.bind(c) as (t: string, j?: string) => Promise<unknown[]>
  x.emAlta = (async (t: string, j?: string) => (await trending(t, j)).map((i) => strip(i as object, ['pessoas']))) as typeof x.emAlta
  return x
}
let current: FakeClient
vi.mock('@/lib/get-network', () => ({ getNetwork: () => ({ cliente: current, ponte: current }) }))

import Notices from '@/app/[lang]/avisos/page'
import CommunityPage from '@/app/[lang]/comunidades/[id]/page'
import Moderation from '@/app/[lang]/comunidades/[id]/moderacao/page'
import NewTopic from '@/app/[lang]/comunidades/[id]/novo/page'
import Discover from '@/app/[lang]/descobrir/page'
import Pages from '@/app/[lang]/paginas/page'
import Profile from '@/app/[lang]/r/[handle]/page'
import { ProfileAbout } from '@/components/profile/ProfileSpec'
import TopicPage from '@/app/[lang]/t/[id]/page'

const renderScreen = async (jsx: Promise<React.ReactElement>) => render(await jsx)
const lang = { lang: 'pt' }

beforeEach(() => {
  // The screens read the real clock at some points (appeal deadline, badge grace period). Without pinning it, this file's tests start to
  // fail on their own when the calendar moves (it happened on 2026-11-11 and 2026-11-17, with the CLOCK at 05/11). Whoever needs another clock
  // calls useFakeTimers again inside their own test.
  vi.useFakeTimers({ now: CLOCK, toFake: ['Date'] })
  notFound.mockClear()
  fake = new FakeClient(() => CLOCK)
  current = fake
})
afterEach(() => {
  vi.useRealTimers()
})

describe('moderation: dismiss a report', () => {
  const openAction = () => renderScreen(Moderation({ params: Promise.resolve({ ...lang, id: COMMUNITIES.vitrola }), searchParams: Promise.resolve({ aba: 'fila' }) }))
  it('with relay 0.3.1 each report in the queue has "Dispensar a denúncia" and the honest note of what that does', async () => {
    await openAction()
    expect(screen.getAllByRole('button', { name: 'Dispensar a denúncia' })).toHaveLength(3)
    expect(screen.getAllByText(/Dispensar tira o caso da fila e deixa o conteúdo no ar/).length).toBe(3)
    expect(screen.queryByText(/A denúncia continua na fila/)).toBeNull()
  })
  it('with relay 0.3 the button does not even exist and the earlier text stays ("a denúncia continua na fila")', async () => {
    current = asRelay03(fake)
    await openAction()
    expect(screen.queryByRole('button', { name: 'Dispensar a denúncia' })).toBeNull()
    expect(screen.getAllByText(/Não fazer nada deixa o conteúdo no ar/).length).toBe(3)
  })
  it('what stayed in the queue after dismissing a report: one fewer, and the content is still there', async () => {
    await fake.agir({ tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: OBJECTS.replyToModerate })
    await openAction()
    expect(screen.getAllByRole('button', { name: 'Dispensar a denúncia' })).toHaveLength(2)
  })
})

describe('pages: topic filter', () => {
  const openAction = () => renderScreen(Pages({ params: Promise.resolve(lang), searchParams: Promise.resolve({}) }))
  it('with the relay\'s topic list the chips bring how many pages each topic has', async () => {
    await openAction()
    const group = screen.getByRole('group', { name: /tema/i })
    expect(within(group).getByRole('link', { name: /#ascii\s*1/ })).toBeInTheDocument()
    expect(within(group).getByRole('link', { name: /#atalhos\s*1/ })).toBeInTheDocument()
  })
  it('with relay 0.3 the chips come from the pages the screen already loaded, without a count', async () => {
    current = asRelay03(fake)
    await openAction()
    const group = screen.getByRole('group', { name: /tema/i })
    const link = within(group).getByRole('link', { name: '#ascii' })
    expect(link.textContent).toBe('#ascii')
  })
})

describe('topic: reactions', () => {
  const openAction = () => renderScreen(TopicPage({ params: Promise.resolve({ ...lang, id: TOPICS.cinemaPopcorn }) }))
  it('Lumi (member) sees the bar with the counts and reacts; his reaction stays marked', async () => {
    await openAction()
    const group = screen.getByRole('group', { name: 'Reações a este tópico' })
    expect(within(group).getByRole('button', { name: 'Curtir: 6' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByRole('button', { name: 'Útil: 3' })).toBeInTheDocument()
  })
  it('after reacting, the page shows his reaction', async () => {
    await fake.reagir(TOPICS.cinemaPopcorn, 'curtir')
    await openAction()
    const group = screen.getByRole('group', { name: 'Reações a este tópico' })
    expect(within(group).getByRole('button', { name: 'Curtir: 7' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('with relay 0.3 the topic brings no counts and the bar does NOT even appear', async () => {
    current = asRelay03(fake)
    await openAction()
    expect(screen.queryByRole('group', { name: 'Reações a este tópico' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('perfil: selos, datas e contagens', () => {
  // The profile page mounts ASYNCHRONOUS tabs (wall, testimonials...) that jsdom does not render. So the whole page runs (the real data and wiring)
  // and, with what it returned, only the SPEC SHEET is mounted, which is where the badges and the counts live.
  type Elem = { props?: { children?: unknown } }
  // In folgali the sheet was split in two: the header (ProfileSpec) and the "About" card in the left column (ProfileAbout),
  // where the badges and the counts live. Mounts both.
  const find = (e: unknown): React.ReactElement | null => {
    if (!e || typeof e !== 'object') return null
    const el = e as React.ReactElement<{ children?: unknown }>
    if (el.type === ProfileAbout) return el
    for (const x of [el.props?.children].flat(9)) {
      const r = find(x)
      if (r) return r
    }
    return null
  }
  async function token(handle = 'pipa') {
    const root = (await Profile({ params: Promise.resolve({ ...lang, handle }), searchParams: Promise.resolve({}) })) as unknown as Elem
    const children = root.props?.children as Elem[]
    return { cab: children[0] as unknown as React.ReactElement<{ can: string }>, sobre: find(root) }
  }
  const build = async (handle = 'pipa') => {
    const { cab: header, sobre: about } = await token(handle)
    render(<>{header}{about}</>)
    return header.props.can
  }
  it('followers AND following on the sheet, with the relay\'s numbers (only once: in the header, without the repeated row in About)', async () => {
    await build('pipa')
    const nums = [...document.querySelectorAll('.pf-numbers .pf-num')].map((e) => e.textContent)
    expect(nums).toContain('219 seguidores')
    expect(nums).toContain('5 seguindo')
    expect(document.querySelector('dl.pf-counts')).toBeNull()
  })
  it('the badge Lumi already gave loses its button; the others continue', async () => {
    await fake.agir({ tipo: 'selo', alvo: uidOf('pipa'), selo: 'rapido' })
    expect(await build('pipa')).toBe('sim')
    const medals = document.querySelector('.pf-medals') as HTMLElement
    const quick = within(medals).getAllByRole('listitem').find((li) => within(li).queryByText('Rápido', { selector: 'strong' }))!
    expect(within(quick).queryByRole('button')).toBeNull()
    expect(within(quick).getByText('Dado')).toBeInTheDocument()
    expect(within(medals).getAllByRole('button')).toHaveLength(3)
  })
  it('with relay 0.3 all badges have a button and the counts use the profile\'s number (without breaking)', async () => {
    current = asRelay03(fake)
    expect(await build('pipa')).toBe('sim')
    expect(within(document.querySelector('.pf-medals') as HTMLElement).getAllByRole('button')).toHaveLength(4)
    expect([...document.querySelectorAll('.pf-numbers .pf-num')].some((e) => /\d+ seguidores/.test(e.textContent ?? ''))).toBe(true)
  })
  it('a friendship that is not 7 days old yet: the screen says the DATE on which badges can be given (relay 0.3.1) and the button goes away', async () => {
    // Mimi became Lumi's friend 2 days ago: the badge only counts 7 days later (5 from now), and Lumi's account is already old
    // the screen reads the real clock at some points: without pinning it here, the test starts failing on the day the clock passes CLOCK + 5 days
    // (it happened on 2026-11-11, with the CLOCK at 05/11)
    vi.useFakeTimers({ now: CLOCK, toFake: ['Date'] })
    try {
      const mimi = new FakeClient(() => CLOCK)
      mimi.social.amizades.push({ a: uidOf('lumi'), b: uidOf('mimi'), desde: CLOCK.getTime() - 2 * 86_400_000 })
      current = mimi
      expect(await build('mimi')).toBe('sem-tempo')
      expect(screen.getByText(/Você poderá dar selo a partir de/)).toBeInTheDocument()
      expect(within(document.querySelector('.pf-medals') as HTMLElement).queryAllByRole('button')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
  it('the relay\'s dates make the extra calls that the earlier workaround made unnecessary (friend list and reader profile)', async () => {
    const friends = vi.spyOn(fake, 'amigos')
    await token('pipa')
    expect(friends).not.toHaveBeenCalled()
    current = asRelay03(fake)
    const friends03 = vi.spyOn(current, 'amigos')
    await token('pipa')
    expect(friends03).toHaveBeenCalled()
  })
})

describe('notices: what was removed', () => {
  const openAction = () => renderScreen(Notices({ params: Promise.resolve(lang) }))
  it('with relay 0.3.1 the section lists what was removed, the role, the reason, the retained excerpt and the way to appeal', async () => {
    await openAction()
    const section = screen.getByRole('heading', { name: /O que foi removido/ }).closest('section')!
    expect(within(section).getByText(/por a pessoa dona/)).toBeInTheDocument()
    expect(within(section).getByText('Propaganda ou repetição')).toBeInTheDocument()
    expect(within(section).getByText(/lembretes/)).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'Apelar' })).toHaveAttribute('href', `/pt/comunidades/${COMMUNITIES.praia}/apelar?alvo=${oid('tpraialumi')}`)
  })
  it('with relay 0.3 the section does not appear and the notices continue', async () => {
    current = asRelay03(fake)
    await openAction()
    expect(screen.queryByRole('heading', { name: /O que foi removido/ })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Avisos' })).toBeInTheDocument()
  })
})

describe('community where Lumi was banned: appeal deadline', () => {
  const openAction = () => renderScreen(CommunityPage({ params: Promise.resolve({ ...lang, id: COMMUNITIES.praia }), searchParams: Promise.resolve({}) }))
  it('with the relay\'s `bannedAt` the screen says the days left, WITHOUT reading the public log', async () => {
    // the screen counts the days with the real clock: without pinning it at CLOCK, the test started failing when the clock passed the appeal
    // deadline counted from the seed's ban (seen on 2026-11-17; the same defect as the badge test above)
    vi.useFakeTimers({ now: CLOCK, toFake: ['Date'] })
    const record = vi.spyOn(fake, 'registroDaComunidade')
    await openAction()
    expect(screen.getByText(/Faltam \d+ dias? para o prazo de apelação/)).toBeInTheDocument()
    expect(record).not.toHaveBeenCalled()
  })
  it('with relay 0.3 the date comes from the public log, as before', async () => {
    current = asRelay03(fake)
    const record = vi.spyOn(current, 'registroDaComunidade')
    await openAction()
    expect(record).toHaveBeenCalled()
  })
})

describe('new topic: member grace period with the minutes left', () => {
  it('someone who joined 20 minutes ago sees "tópicos e votos abrem em 40 minutos" (relay 0.3.1) and the form continues', async () => {
    const you = (await fake.comunidade(COMMUNITIES.cozinha)).voce
    expect(you?.membroDesde).toBeTruthy()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.parse(you!.membroDesde!) + 20 * 60_000))
    await renderScreen(NewTopic({ params: Promise.resolve({ ...lang, id: COMMUNITIES.cozinha }), searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Você entrou há pouco: tópicos e votos abrem em 40 minutos.')).toBeInTheDocument()
  })
  it('once the hour passes, the notice goes away', async () => {
    const you = (await fake.comunidade(COMMUNITIES.cozinha)).voce
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.parse(you!.membroDesde!) + 61 * 60_000))
    await renderScreen(NewTopic({ params: Promise.resolve({ ...lang, id: COMMUNITIES.cozinha }), searchParams: Promise.resolve({}) }))
    expect(screen.queryByText(/Você entrou há pouco/)).toBeNull()
  })
  it('with relay 0.3 there is no join date and the screen does not invent a grace period', async () => {
    current = asRelay03(fake)
    await renderScreen(NewTopic({ params: Promise.resolve({ ...lang, id: COMMUNITIES.cozinha }), searchParams: Promise.resolve({}) }))
    expect(screen.queryByText(/Você entrou há pouco/)).toBeNull()
  })
})

describe('discover: people in trending', () => {
  const openAction = () => renderScreen(Discover({ searchParams: Promise.resolve({}), params: Promise.resolve(lang) } as never))
  it('each trending item says how many people moved it (just the number)', async () => {
    await openAction()
    expect(screen.getAllByText(/pessoas? (respondeu|responderam)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/pessoas? em movimento/).length).toBeGreaterThan(0)
  })
  it('with relay 0.3 the items appear without the count', async () => {
    current = asRelay03(fake)
    await openAction()
    expect(screen.queryByText(/pessoas? (respondeu|responderam)/)).toBeNull()
    expect(screen.queryByText(/pessoas? em movimento/)).toBeNull()
  })
})
