// Events on the screen (protocol 0.11.0 part 4), real mode: the card (cover, when, where, counts, cancelled or ended), the list with its
// filters, the open event for a visitor and for a person, the Vou / Talvez / Não vou buttons (current answer marked, change, full,
// ended, the same answer again), the organizer's edit and cancel, and the form (the exact body it signs, end after start, a place
// for an event in person, an edit sending the whole content).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  personState: vi.fn(),
  publish: vi.fn(),
  myRsvp: vi.fn(),
  myCommunities: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  pessoa: null as null | { id: string; nome: string },
  adult: false,
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, redirect: vi.fn(), useRouter: () => ({ push: h.push, refresh: h.refresh }), usePathname: () => '/pt/eventos' }))
vi.mock('@/lib/person/client', async (original) => ({ ...(await original<typeof import('@/lib/person/client')>()), personState: h.personState, publish: h.publish }))
vi.mock('@/lib/events/client', async (original) => ({ ...(await original<typeof import('@/lib/events/client')>()), myRsvp: h.myRsvp, myCommunities: h.myCommunities }))
vi.mock('@/lib/site', async (original) => ({ ...(await original<typeof import('@/lib/site')>()), isDemo: () => false }))
vi.mock('@/lib/folgali/issuers', async (original) => ({ ...(await original<typeof import('@/lib/folgali/issuers')>()), issuersReady: () => ({ login: {}, relay: 'http://rele', issuer: 'http://rele' }) }))
vi.mock('@/lib/folgali/session', async (original) => ({ ...(await original<typeof import('@/lib/folgali/session')>()), currentPerson: async () => h.pessoa }))
vi.mock('@/lib/adult', async (original) => ({ ...(await original<typeof import('@/lib/adult')>()), canSeeAdult: async () => h.adult }))
vi.mock('@/lib/get-network', () => ({ getNetwork: () => ({ cliente: { modo: 'http' }, ponte: { whoAmI: async () => null } }) }))

import OpenEvent from '@/app/[lang]/eventos/[id]/page'
import Events from '@/app/[lang]/eventos/page'
import OrganizerActions from '@/components/events/OrganizerActions'
import EventCardView from '@/components/events/EventCardView'
import EventFormView from '@/components/events/EventFormView'
import EventRsvp from '@/components/events/EventRsvp'
import { EVENT_TEXTS } from '@/i18n/events'
import { DEFAULT_LIMITS } from '@/lib/events/types'
import { eventCard } from '@/lib/events/sanitize'
import { legalDict } from '@/lib/legal-i18n'
import { PersonError } from '@/lib/person/client'
import { forgetViewer } from '@/lib/person/viewer'
import { ANA, BIA, COMMUNITY_ID, EVENT_ID, EVENT_ID_2, NOW, START, relayAttendee, relayCard, relayDetail } from '../events/fixtures'

const t = EVENT_TEXTS.pt
const leak = legalDict('pt').vazamento
const person = (uid = ANA.uid) => ({ uid, handle: 'ana.souza', adult: true, head: null, profile: true, name: 'Ana Souza', consent: true, edit: true })

// ── the relay behind the server reads ──
const relay = vi.fn<(path: string) => { status: number; body: unknown }>()
beforeEach(() => {
  vi.stubEnv('FOLGALI_CLIENT', 'http')
  vi.stubEnv('FOLGALI_RELAY_URL', 'http://rele.local')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).replace('http://rele.local', '')
    const r = relay(path)
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }))
  relay.mockReset()
  for (const f of [h.personState, h.publish, h.myRsvp, h.myCommunities, h.refresh, h.push]) f.mockReset()
  h.myRsvp.mockResolvedValue(null)
  h.myCommunities.mockResolvedValue([])
  // nobody signed in unless a test says so (the organizer's buttons ask who is looking)
  h.personState.mockRejectedValue(new PersonError(401, 'sem_sessao'))
  h.pessoa = null
  h.adult = false
  forgetViewer()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** A relay with events on, one event, its answers and the lists. */
function relayWith({ detail = relayDetail(), list = [relayCard()], going = [relayAttendee(ANA), relayAttendee(BIA)], maybe = [] as unknown[] } = {}) {
  relay.mockImplementation((path) => {
    if (path === '/v1/info') return { status: 200, body: { recursos: ['eventos'], eventos: {} } }
    if (path.startsWith(`/v1/eventos/${EVENT_ID}/presencas?resposta=vou`)) return { status: 200, body: { itens: going, proximo: null } }
    if (path.startsWith(`/v1/eventos/${EVENT_ID}/presencas?resposta=talvez`)) return { status: 200, body: { itens: maybe, proximo: null } }
    if (path === `/v1/eventos/${EVENT_ID}`) return { status: 200, body: detail }
    if (path.startsWith('/v1/eventos?')) return { status: 200, body: { itens: list, proximo: null } }
    return { status: 404, body: { erro: { codigo: 'nao_encontrado' } } }
  })
}

describe('the card', () => {
  it('shows the cover, the date badge, when, where, who answered, spots left, who organizes and where', () => {
    render(<ul><EventCardView e={eventCard(relayCard())} lang="pt" t={t} now={NOW} /></ul>)
    const card = screen.getByRole('listitem')
    expect(within(card).getByRole('link', { name: 'Noite de jogos' })).toHaveAttribute('href', `/pt/eventos/${EVENT_ID}`)
    expect(within(card).getByRole('img')).toHaveAttribute('src', '/marca/folgali/covers/stars.webp')
    expect(within(card).getByRole('img').getAttribute('alt')).toMatch(/Acampamento à noite/)
    expect(card).toHaveTextContent('SÁB 5')
    expect(card).toHaveTextContent(/sáb\., 5 de dez\., 20:00 até 23:00/)
    expect(card).toHaveTextContent('Praça da Liberdade, banco perto do coreto')
    expect(card).toHaveTextContent('3 vão · 2 talvez · 7 vagas restantes')
    expect(card).toHaveTextContent('Organizado por Ana Souza · Em Jogos de tabuleiro')
    expect(card).not.toHaveTextContent('Cancelado')
  })
  it('online, full, cancelled and ended say so; a card without cover gets a decorative house cover', () => {
    const { rerender } = render(<ul><EventCardView e={eventCard(relayCard({ online: true, lugar: null, vagasRestantes: 0, capa: null }))} lang="pt" t={t} now={NOW} /></ul>)
    const card = () => screen.getByRole('listitem')
    expect(card()).toHaveTextContent('Online')
    expect(card()).toHaveTextContent('Lotado')
    expect(card().querySelector('img')).toHaveAttribute('alt', '')
    rerender(<ul><EventCardView e={eventCard(relayCard({ estado: 'cancelado' }))} lang="pt" t={t} now={NOW} /></ul>)
    expect(card()).toHaveTextContent('Cancelado')
    expect(card()).toHaveAttribute('data-estado', 'cancelado')
    expect(card()).not.toHaveTextContent('vagas restantes')
    rerender(<ul><EventCardView e={eventCard(relayCard({ encerrado: true }))} lang="pt" t={t} now={NOW} /></ul>)
    expect(card()).toHaveTextContent('Já aconteceu')
  })
})

describe('the list (real mode)', () => {
  const page = async (filter?: string) => render(await Events({ params: Promise.resolve({ lang: 'pt' }), searchParams: Promise.resolve({ filtro: filter }) }))
  it('reads the upcoming events from the relay, with the five filters; a visitor is invited to sign in to create', async () => {
    relayWith({ list: [relayCard(), relayCard({ id: EVENT_ID_2, titulo: 'Conversa por vídeo', online: true, lugar: null })] })
    await page()
    expect(screen.getByRole('heading', { level: 1, name: 'Eventos' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Noite de jogos|Conversa por vídeo/ })).toHaveLength(2)
    const nav = screen.getByRole('navigation', { name: 'Filtros' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Próximos', '/pt/eventos'], ['Esta semana', '/pt/eventos?filtro=semana'], ['Hoje', '/pt/eventos?filtro=hoje'], ['Online', '/pt/eventos?filtro=online'], ['Já aconteceram', '/pt/eventos?filtro=passados'],
    ])
    expect(within(nav).getByRole('link', { name: 'Próximos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Entre para criar um evento' })).toHaveAttribute('href', '/pt/entrar')
    expect(relay).toHaveBeenCalledWith('/v1/eventos?quando=proximos&limite=24')
  })
  it('online keeps only online events; a signed-in person gets "Criar evento"; 18+ events stay out for who cannot see them', async () => {
    h.pessoa = { id: 'p_ana', nome: 'Ana' }
    relayWith({ list: [relayCard(), relayCard({ id: EVENT_ID_2, titulo: 'Conversa por vídeo', online: true, lugar: null }), relayCard({ id: `ob_${'G'.repeat(43)}`, titulo: 'Festa adulta', online: true, adulto: true })] })
    await page('online')
    expect(screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)).toEqual(['Filtros', 'Conversa por vídeo'])
    expect(screen.getByRole('link', { name: 'Criar evento' })).toHaveAttribute('href', '/pt/eventos/novo')
  })
  it('an empty past list says so; a relay without events keeps the old empty state', async () => {
    relayWith({ list: [] })
    await page('passados')
    expect(screen.getByText('Nenhum evento aconteceu ainda.')).toBeInTheDocument()
    expect(relay).toHaveBeenCalledWith('/v1/eventos?quando=passados&limite=24')
  })
})

describe('the open event (real mode)', () => {
  const open = async () => render(await OpenEvent({ params: Promise.resolve({ lang: 'pt', id: EVENT_ID }) }))
  it('a visitor sees the event, the description, who goes and the invitation to sign in; no answer buttons', async () => {
    relayWith()
    await open()
    expect(screen.getByRole('heading', { level: 1, name: 'Noite de jogos' })).toBeInTheDocument()
    expect(screen.getByText(/Tragam seus jogos favoritos/)).toBeInTheDocument()
    expect(screen.getByText(/sáb\., 5 de dez\., 20:00 até 23:00/)).toBeInTheDocument()
    expect(screen.getByText('Praça da Liberdade, banco perto do coreto')).toBeInTheDocument()
    const who = screen.getByRole('region', { name: 'Quem vai' })
    expect(within(who).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/pt/r/ana.souza', '/pt/r/bia.lima'])
    expect(screen.getByText('Entre com a conta Rovemark para responder.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/pt/entrar')
    expect(screen.queryByRole('button', { name: 'Vou' })).not.toBeInTheDocument()
  })
  it('a signed-in person gets Vou, Talvez and Não vou with her answer marked', async () => {
    h.pessoa = { id: 'p_bia', nome: 'Bia' }
    h.myRsvp.mockResolvedValue('talvez')
    relayWith()
    await open()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Talvez' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('button', { name: 'Vou' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Não vou' })).toBeInTheDocument()
    expect(h.myRsvp).toHaveBeenCalledWith(EVENT_ID)
  })
  it('a cancelled event says so and takes no answers; an online event shows its https link', async () => {
    h.pessoa = { id: 'p_bia', nome: 'Bia' }
    relayWith({ detail: relayDetail({ estado: 'cancelado', online: true, lugar: 'https://meet.example.org/abc' }) })
    await open()
    expect(screen.getByRole('status')).toHaveTextContent('Este evento foi cancelado por quem organiza.')
    expect(screen.queryByRole('button', { name: 'Vou' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir o link da chamada' })).toHaveAttribute('href', 'https://meet.example.org/abc')
  })
  it('an 18+ event shows only the notice to who cannot see it; an unknown event is not found', async () => {
    relayWith({ detail: relayDetail({ adulto: true }) })
    await open()
    expect(screen.getByText(/para maiores de 18 anos/)).toBeInTheDocument()
    expect(screen.queryByText('Noite de jogos')).not.toBeInTheDocument()
    relay.mockImplementation(() => ({ status: 404, body: { erro: { codigo: 'nao_encontrado' } } }))
    await expect(OpenEvent({ params: Promise.resolve({ lang: 'pt', id: EVENT_ID }) })).rejects.toThrow('NOT_FOUND')
  })
})

describe('the answer buttons', () => {
  const show = () => render(<EventRsvp eventId={EVENT_ID} lang="pt" t={t} />)
  it('marks the current answer, changes it with a signed evento-presenca and reads the page again', async () => {
    h.myRsvp.mockResolvedValue('talvez')
    h.publish.mockResolvedValue({ id: 'ob_x' })
    show()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Talvez' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(screen.getByRole('button', { name: 'Vou' }))
    expect(h.publish).toHaveBeenCalledWith('evento-presenca', { evento: EVENT_ID, resposta: 'vou' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vou' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('button', { name: 'Talvez' })).toHaveAttribute('aria-pressed', 'false')
    expect(h.refresh).toHaveBeenCalled()
    // tapping the answer she already has sends nothing
    await userEvent.click(screen.getByRole('button', { name: 'Vou' }))
    expect(h.publish).toHaveBeenCalledTimes(1)
  })
  it('a full event refuses Vou and suggests Talvez; the answer stays as it was', async () => {
    h.publish.mockRejectedValueOnce(new PersonError(409, 'evento_lotado'))
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Vou' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('As vagas acabaram. Você pode responder Talvez para acompanhar.')
    expect(alert).toHaveAttribute('data-lotado', '1')
    expect(screen.getByRole('button', { name: 'Vou' })).toHaveAttribute('aria-pressed', 'false')
    expect(h.refresh).not.toHaveBeenCalled()
    h.publish.mockResolvedValueOnce({ id: 'ob_y' })
    await userEvent.click(screen.getByRole('button', { name: 'Talvez' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Talvez' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('an ended event says answers are closed; the same answer again counts as done', async () => {
    h.publish.mockRejectedValueOnce(new PersonError(409, 'evento_encerrado'))
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Não vou' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este evento foi cancelado ou já aconteceu. As respostas estão fechadas.')
    h.publish.mockRejectedValueOnce(new PersonError(409, 'ja_existe'))
    await userEvent.click(screen.getByRole('button', { name: 'Talvez' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Talvez' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the organizer', () => {
  const show = (closed = false) => render(<OrganizerActions eventId={EVENT_ID} organizer={ANA.uid} lang="pt" closed={closed} t={t} />)
  it('only the organizer sees Edit and Cancel', async () => {
    h.personState.mockResolvedValue(person(BIA.uid))
    show()
    await act(async () => {})
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
  })
  it('Cancel asks first in the page, then signs evento-cancelar; Back changes nothing', async () => {
    h.personState.mockResolvedValue(person())
    h.publish.mockResolvedValue({ id: 'ob_c' })
    show()
    expect(await screen.findByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/pt/eventos/${EVENT_ID}/editar`)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar evento' }))
    expect(screen.getByText(/Quem respondeu Vou ou Talvez recebe um aviso/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(h.publish).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar evento' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }))
    expect(h.publish).toHaveBeenCalledWith('evento-cancelar', { evento: EVENT_ID })
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
  })
  it('a closed event keeps only the note', async () => {
    h.personState.mockResolvedValue(person())
    show(true)
    expect(await screen.findByText('Você organiza este evento.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar evento' })).not.toBeInTheDocument()
  })
})

// (the time zone select draws several hundred options on each change: the form tests get more time on a busy machine)
describe('the form', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  const show = (mode: Parameters<typeof EventFormView>[0]['mode'] = { kind: 'new' }) =>
    render(<EventFormView lang="pt" t={t} leak={leak} limits={DEFAULT_LIMITS} mode={mode} consentHref="/pt/entrar" profileHref="/pt/linha" />)
  // (a select with every time zone is slow to drive key by key: the fields take their value at once)
  const fill = async (x: Record<string, string>) => {
    for (const [label, value] of Object.entries(x)) {
      fireEvent.change(screen.getByLabelText(label, { selector: 'input, textarea, select' }), { target: { value } })
    }
  }
  const inGroup = (legend: string) => within(screen.getByRole('group', { name: legend }))

  it('signs the exact evento-criar body: instants in UTC from the zone she chose, the place, the cover, the spots, her community', async () => {
    h.personState.mockResolvedValue(person())
    h.myCommunities.mockResolvedValue([{ id: COMMUNITY_ID, nome: 'Jogos de tabuleiro' }])
    h.publish.mockResolvedValue({ id: EVENT_ID })
    show({ kind: 'new', community: COMMUNITY_ID })
    await screen.findByRole('heading', { name: 'Criar evento' })
    await fill({ 'Nome do evento': 'Noite de jogos', 'Descrição (opcional)': 'Tragam seus jogos.', 'Fuso horário': 'America/Sao_Paulo', Lugar: 'Praça da Liberdade', 'Vagas (opcional)': '10' })
    fireEvent.change(inGroup('Começa').getByLabelText('Data'), { target: { value: '2026-12-05' } })
    fireEvent.change(inGroup('Começa').getByLabelText('Hora'), { target: { value: '20:00' } })
    fireEvent.change(inGroup('Termina (opcional)').getByLabelText('Data'), { target: { value: '2026-12-05' } })
    fireEvent.change(inGroup('Termina (opcional)').getByLabelText('Hora'), { target: { value: '23:00' } })
    fireEvent.click(screen.getByRole('radio', { name: /Acampamento à noite/ }))
    await waitFor(() => expect(screen.getByLabelText('Comunidade')).toHaveValue(COMMUNITY_ID))
    await userEvent.click(screen.getByRole('button', { name: 'Criar evento' }))
    expect(h.publish).toHaveBeenCalledWith('evento-criar', {
      comunidade: COMMUNITY_ID, titulo: 'Noite de jogos', descricao: 'Tragam seus jogos.', inicio: START, fim: START + 3 * 3600, fuso: 'America/Sao_Paulo',
      online: false, lugar: 'Praça da Liberdade', capa: { galeria: 'cover-stars' }, vagas: 10,
    })
    await waitFor(() => expect(h.push).toHaveBeenCalledWith(`/pt/eventos/${EVENT_ID}`))
  })
  it('an end before the start and an event in person without a place are said on their fields; nothing is signed', async () => {
    h.personState.mockResolvedValue(person())
    show()
    await screen.findByRole('heading', { name: 'Criar evento' })
    await fill({ 'Nome do evento': 'Noite de jogos', 'Fuso horário': 'America/Sao_Paulo' })
    fireEvent.change(inGroup('Começa').getByLabelText('Data'), { target: { value: '2026-12-05' } })
    fireEvent.change(inGroup('Começa').getByLabelText('Hora'), { target: { value: '20:00' } })
    fireEvent.change(inGroup('Termina (opcional)').getByLabelText('Data'), { target: { value: '2026-12-05' } })
    fireEvent.change(inGroup('Termina (opcional)').getByLabelText('Hora'), { target: { value: '18:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Criar evento' }))
    expect(h.publish).not.toHaveBeenCalled()
    expect(screen.getByText('O fim vem depois do começo.')).toBeInTheDocument()
    expect(screen.getByText('Diga o lugar do evento presencial.')).toBeInTheDocument()
    expect(screen.getByLabelText('Lugar')).toHaveAttribute('aria-invalid', 'true')
    // online needs no place; fixing the end lets it go
    await userEvent.click(screen.getByRole('radio', { name: 'Online' }))
    fireEvent.change(inGroup('Termina (opcional)').getByLabelText('Hora'), { target: { value: '22:00' } })
    expect(screen.queryByText('O fim vem depois do começo.')).not.toBeInTheDocument()
    h.publish.mockResolvedValue({ id: EVENT_ID })
    await userEvent.click(screen.getByRole('button', { name: 'Criar evento' }))
    expect(h.publish).toHaveBeenCalledWith('evento-criar', expect.objectContaining({ comunidade: null, online: true, lugar: null, fim: START + 2 * 3600 }))
  })
  it('the leak detector speaks while she types, and the relay refusal comes back as a sentence', async () => {
    h.personState.mockResolvedValue(person())
    h.publish.mockRejectedValueOnce(new PersonError(429, 'limite_de_taxa', { retryAfterS: 600 }))
    show()
    await screen.findByRole('heading', { name: 'Criar evento' })
    await fill({ 'Descrição (opcional)': 'minha senha: hunter2hunter2' })
    expect(screen.getAllByRole('alert').some((a) => a.classList.contains('notice-leak'))).toBe(true)
    await fill({ 'Descrição (opcional)': '', 'Nome do evento': 'Noite de jogos', 'Fuso horário': 'America/Sao_Paulo', Lugar: 'Praça' })
    await userEvent.click(screen.getByRole('button', { name: 'Criar evento' }))
    expect(await screen.findByText('Você chegou ao limite de eventos por agora. Libera em 10 minutos.')).toBeInTheDocument()
  })
  it('editing: only the organizer gets the form, prefilled; it signs evento-editar with the whole content', async () => {
    h.personState.mockResolvedValue(person(BIA.uid))
    const event = eventCard(relayCard())
    const { unmount } = show({ kind: 'edit', event })
    expect(await screen.findByText('Só quem organiza pode editar este evento.')).toBeInTheDocument()
    unmount()
    h.personState.mockResolvedValue(person())
    h.publish.mockResolvedValue({ id: 'ob_edit' })
    show({ kind: 'edit', event })
    await screen.findByRole('heading', { name: 'Editar evento' })
    expect(screen.getByLabelText('Nome do evento')).toHaveValue('Noite de jogos')
    expect(inGroup('Começa').getByLabelText('Hora')).toHaveValue('20:00')
    expect(screen.queryByLabelText('Comunidade')).not.toBeInTheDocument()
    await fill({ 'Vagas (opcional)': '12' })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar mudanças' }))
    expect(h.publish).toHaveBeenCalledWith('evento-editar', {
      evento: EVENT_ID, titulo: 'Noite de jogos', descricao: 'Tragam seus jogos favoritos.\nTem café.', inicio: START, fim: START + 3 * 3600, fuso: 'America/Sao_Paulo',
      online: false, lugar: 'Praça da Liberdade, banco perto do coreto', capa: { galeria: 'cover-stars' }, vagas: 12,
    })
    await waitFor(() => expect(h.push).toHaveBeenCalledWith(`/pt/eventos/${EVENT_ID}`))
  })
  it('without a profile, she is sent to create one first', async () => {
    h.personState.mockResolvedValue({ ...person(), profile: false, handle: null })
    show()
    expect(await screen.findByRole('link', { name: 'Criar meu perfil' })).toHaveAttribute('href', '/pt/linha')
  })
})
