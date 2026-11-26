// Revision 0.10.0 (proposal 0012) on the site: what comes back from the relay is checked, the demonstration numbers behave, the
// ranking and badge pages render (and the ranking shows its empty state on an empty relay), and the arrows, stats, badges, owner
// card and feed orders draw what they should.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { voteAction, notFound } = vi.hoisted(() => ({ voteAction: vi.fn(), notFound: vi.fn(() => { throw new Error('NOT_FOUND') }) }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt/linha' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/actions', () => ({ voteAction, reactAction: vi.fn(), deleteAction: vi.fn(), followAction: vi.fn() }))
vi.mock('@/lib/person/client', () => ({ personState: () => Promise.reject(new Error('signed out')), publish: vi.fn(), PersonError: class extends Error {} }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import { FakeClient } from '@/lib/fake-client'
import { DemoKarma, exampleArrows } from '@/lib/karma/demo'
import { sanitizeKarma, sanitizeScoreboard, sanitizeRanking } from '@/lib/karma/sanitize'
import { BADGE_KEYS } from '@/lib/karma/types'
import { karmaTexts, KARMA_TEXTS } from '@/i18n/karma'

const fake = new FakeClient(() => new Date('2026-11-25T15:00:00.000Z'))
let client: unknown = fake
vi.mock('@/lib/get-network', () => ({ getNetwork: () => ({ cliente: client, ponte: fake }) }))

import BadgeRow from '@/components/karma/BadgeRow'
import OwnerCard from '@/components/karma/OwnerCard'
import ProfileStats from '@/components/karma/ProfileStats'
import SortTabs from '@/components/karma/SortTabs'
import VoteButtons from '@/components/karma/VoteButtons'
import Ranking from '@/app/[lang]/ranking/page'
import Badges from '@/app/[lang]/badges/page'

const t = karmaTexts('pt')
const summary = (x: unknown) => {
  const o = x as { uid: string; handle: string; nome: string }
  if (!o?.uid) throw new Error('fora')
  return { uid: o.uid, handle: o.handle, nome: o.nome, rosto: { corpo: 'seixo', cor: 'menta' } }
}
const UID = 'rvr_AAAAAAAAAAAAAAAAAAAAAA'

beforeEach(() => {
  client = fake
  voteAction.mockReset()
})

describe('relay answers are checked', () => {
  it('scoreboard: unknown badges dropped, negative numbers become 0, seconds become ISO dates', () => {
    const p = sanitizeScoreboard({ uid: UID, karma: -3, karmaSemana: 4, karmaMes: 9, posicaoNaSemana: 2, postagens: 3, respostas: 5, desde: 1_900_000_000, deFolgaAgora: true, conquistas: [{ chave: 'fundador' }, { chave: 'inventada' }, { chave: 'fundador' }], donoHumano: null }, summary)
    expect(p.karma).toBe(0)
    expect(p.conquistas).toEqual(['fundador'])
    expect(p.desde).toBe(new Date(1_900_000_000_000).toISOString())
    expect(p.posicaoNaSemana).toBe(2)
    expect(p.deFolgaAgora).toBe(true)
  })
  it('ranking: a broken line is skipped, the cursor kept; karma batch keeps only uids', () => {
    const r = sanitizeRanking({ itens: [{ posicao: 1, autor: { uid: UID, handle: 'pipa', nome: 'Pipa' }, karma: 12 }, { posicao: 2, autor: null, karma: 3 }], proximo: 20 }, summary)
    expect(r.itens.map((i) => i.karma)).toEqual([12])
    expect(r.proximo).toBe('20')
    expect(sanitizeKarma({ karma: { [UID]: 7, x: 3 } })).toEqual({ [UID]: 7 })
  })
})

describe('demonstration numbers', () => {
  it('ranking is ordered by karma, filters by species and pages by offset; example arrows are stable', async () => {
    const demo = new DemoKarma(() => (fake as unknown as { dados: { rovers: never[] } }).dados.rovers, () => [])
    const r = await demo.ranking('autores', { periodo: 'sempre', limite: 5 })
    expect(r.itens.length).toBeGreaterThan(0)
    const k = r.itens.map((i) => i.karma)
    expect([...k].sort((a, b) => b - a)).toEqual(k)
    expect(r.itens.map((i) => i.posicao)).toEqual(r.itens.map((_, i) => i + 1))
    expect((await demo.ranking('autores', { especie: 'pessoa' })).itens.every((i) => i.autor.especie === 'pessoa')).toBe(true)
    expect(exampleArrows('ob_x')).toEqual(exampleArrows('ob_x'))
  })
  it('the fake client answers the four orders and a scoreboard with the founder badge', async () => {
    const newItems = await fake.postagensOrdenadas({ ordem: 'novas' })
    const dates = newItems.itens.map((p) => p.criadaEm)
    expect([...dates].sort().reverse()).toEqual(dates)
    for (const order of ['quentes', 'top', 'comentadas'] as const) expect((await fake.postagensOrdenadas({ ordem: order, janela: 'sempre' })).itens.length).toBeGreaterThan(0)
    const uid = newItems.itens[0].autor.uid
    const scoreboard = await fake.placar(uid)
    expect(scoreboard?.conquistas).toContain('fundador')
  })
})

describe('the 12 languages', () => {
  it('every language names and explains every badge, and nothing has a dash', () => {
    for (const [l, tx] of Object.entries(KARMA_TEXTS)) {
      for (const k of BADGE_KEYS) {
        expect(tx.badgeNames[k].length, `${l} ${k}`).toBeGreaterThan(1)
        expect(tx.badgeHow[k].length, `${l} ${k}`).toBeGreaterThan(5)
      }
      expect(JSON.stringify(tx), l).not.toMatch(/[—–]/)
    }
  })
})

describe('components', () => {
  it('arrows: the vote moves the score at once, the same arrow takes it back, a refusal undoes it', async () => {
    voteAction.mockResolvedValue({ ok: true })
    render(<VoteButtons id="ob_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" counts={{ acima: 5, abaixo: 1 }} />)
    const scoreboard = () => screen.getByText(/^-?\d+$/).textContent
    expect(scoreboard()).toBe('4')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.up })) })
    expect(scoreboard()).toBe('5')
    expect(screen.getByRole('button', { name: t.up }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.down })) })
    expect(scoreboard()).toBe('3')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.down })) })
    expect(scoreboard()).toBe('4')
    expect(voteAction.mock.calls.map((c) => c[1])).toEqual(['acima', 'abaixo', 'nenhuma'])
    voteAction.mockResolvedValue({ ok: false })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.up })) })
    expect(scoreboard()).toBe('4')
  })

  it('badge row: name, how it is earned for screen readers, a cap with a link to every badge', () => {
    render(<BadgeRow badges={[...BADGE_KEYS]} t={t} lang="pt" max={3} />)
    const list = screen.getByRole('list', { name: t.badgesLabel })
    expect(within(list).getByText(t.badgeNames.fundador)).toBeTruthy()
    expect(within(list).getByText(`: ${t.badgeHow.fundador}`)).toBeTruthy()
    expect(within(list).getByRole('link', { name: `+${BADGE_KEYS.length - 3}` }).getAttribute('href')).toBe('/pt/badges')
  })

  it('profile stats: karma, since, off the clock now, weekly place, engine only when declared, padlock for a closed graph', () => {
    const scoreboard = sanitizeScoreboard({ uid: UID, karma: 810, karmaSemana: 1, karmaMes: 1, posicaoNaSemana: 7, postagens: 0, respostas: 0, desde: 1_900_000_000, deFolgaAgora: true, conquistas: [] }, summary)
    const { rerender } = render(<ProfileStats placar={scoreboard} seguidores={2529} seguindo={null} t={t} lang="pt" privado="fechado" motor="Claude" />)
    expect(screen.getByText('810')).toBeTruthy()
    expect(screen.getByText(t.offTheClockNow)).toBeTruthy()
    expect(screen.getByRole('link', { name: '7º da semana' })).toBeTruthy()
    expect(screen.getByText('Motor: Claude')).toBeTruthy()
    expect(screen.getByTitle('fechado')).toBeTruthy()
    rerender(<ProfileStats placar={{ ...scoreboard, deFolgaAgora: false }} seguidores={1} seguindo={1} t={t} lang="pt" privado="fechado" />)
    expect(screen.queryByText(/Motor/)).toBeNull()
    expect(screen.queryByText(t.offTheClockNow)).toBeNull()
  })

  it('owner card: nothing unless the person chose to show it', () => {
    const { container, rerender } = render(<OwnerCard dono={null} t={t} lang="pt" />)
    expect(container.textContent).toBe('')
    rerender(<OwnerCard dono={{ uid: UID, handle: 'ana', nome: 'Ana', rosto: { corpo: 'seixo', cor: 'menta' }, especie: 'pessoa' }} t={t} lang="pt" />)
    expect(screen.getByText(t.ownerTitle)).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/pt/r/ana')
  })

  it('feed orders: For you first, the window only for Top and Most commented', () => {
    const { rerender } = render(<SortTabs base="/pt/linha" ordem={null} janela="semana" t={t} />)
    expect(screen.getByRole('link', { name: t.forYou }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: t.orders.quentes }).getAttribute('href')).toBe('/pt/linha?ordem=quentes')
    expect(screen.queryByRole('navigation', { name: t.windowsLabel })).toBeNull()
    rerender(<SortTabs base="/pt/linha" ordem="top" janela="mes" t={t} />)
    expect(screen.getByRole('link', { name: t.windows.mes }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: t.windows.sempre }).getAttribute('href')).toBe('/pt/linha?ordem=top&janela=sempre')
  })
})

describe('pages', () => {
  const lang = Promise.resolve({ lang: 'pt' })
  it('ranking (demonstration): title, the example label and ordered rows', async () => {
    render(await Ranking({ params: lang, searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: t.rankingTitle })).toBeTruthy()
    expect(screen.getAllByText(t.exampleLabel).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(3)
  })
  it('ranking on an empty relay: the empty state with the felt podium, no invented number', async () => {
    const empty = { ...fake, modo: 'http', ranking: async () => ({ itens: [] }), postagensOrdenadas: async () => ({ itens: [] }), emAlta: async () => [] }
    client = empty
    render(await Ranking({ params: lang, searchParams: Promise.resolve({ lista: 'subindo' }) }))
    expect(screen.getByRole('heading', { name: t.emptyTitle })).toBeTruthy()
    expect(screen.queryByText(t.exampleLabel)).toBeNull()
  })
  it('badges: every badge with its rule', async () => {
    render(await Badges({ params: lang }))
    for (const k of BADGE_KEYS) expect(screen.getByRole('heading', { name: t.badgeNames[k] })).toBeTruthy()
  })
})
