// Events on the site (protocol 0.11.0 part 4), the modules: cleaning what the relay says (strange fields dropped, broken items left out,
// enums closed), time zones without a library, the dates in words, the body the form signs and its rules, the refusals in words,
// the filters of the list, the server reads (paths and query) and the route that carries the person's own answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ who: null as null | { pessoa: string; nome: string; at: string }, relay: vi.fn(), communities: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/folgali/session', () => ({ accessFromRequest: async () => h.who, currentPerson: async () => null }))
vi.mock('@/lib/folgali/issuers', async (original) => ({
  ...(await original<typeof import('@/lib/folgali/issuers')>()),
  issuersReady: () => ({ login: {}, relay: 'http://rele', issuer: 'http://rele' }),
  knownUid: () => `rvr_${'a'.repeat(22)}`,
  readOnRelayAs: h.relay,
}))
vi.mock('@/lib/get-network', () => ({ getNetwork: () => ({ cliente: { comunidadesDoRover: h.communities } }) }))

import { GET, POST } from '@/app/api/person/events/route'
import { filterEvents } from '@/components/events/RealEvents'
import { callLink } from '@/components/events/RealEvent'
import { EVENT_TEXTS } from '@/i18n/events'
import { checkForm, createBody, editBody, type EventForm } from '@/lib/events/body'
import { dayBadge, isToday, whenText } from '@/lib/events/dates'
import { dayIn, instantToZoned, isZone, zonedToInstant } from '@/lib/events/timezone'
import { attendees, eventsOnRelay, listEvents, readEvent, relayAddress } from '@/lib/events/read'
import { eventRefusal } from '@/lib/events/refusal'
import { attendeeList, eventCard, eventDetail, eventList, eventsInfo } from '@/lib/events/sanitize'
import { DEFAULT_LIMITS } from '@/lib/events/types'
import { PersonError } from '@/lib/person/client'
import { LOCALES } from '@/lib/i18n-base'
import { ANA, BIA, COMMUNITY_ID, EVENT_ID, EVENT_ID_2, NOW, START, relayAttendee, relayCard, relayDetail } from './fixtures'

const t = EVENT_TEXTS.pt

describe('cleaning what the relay says', () => {
  it('a card keeps only the contract fields, typed; unknown fields are dropped', () => {
    const c = eventCard({ ...relayCard(), segredo: 'x', organizador: { ...ANA, email: 'ana@example.com' }, contagens: { vou: 3, talvez: 2, naoVou: 1, outra: 9 }, html: '<b>' })
    expect(Object.keys(c).sort()).toEqual(['capa', 'comunidade', 'contagens', 'criadoEm', 'descricao', 'editado', 'encerrado', 'estado', 'fim', 'fuso', 'id', 'inicio', 'lugar', 'minhaPresenca', 'online', 'organizador', 'titulo', 'vagas', 'vagasRestantes'])
    expect(c.organizador).not.toHaveProperty('email')
    expect(c.contagens).toEqual({ vou: 3, talvez: 2, naoVou: 1 })
    expect(c.capa).toBe('cover-stars')
    expect(c.descricao).toBe('Tragam seus jogos favoritos.\nTem café.')
  })
  it('odd values are closed: an unknown cover, a time zone that is not one, an answer that is not one, a negative count', () => {
    const c = eventCard(relayCard({ capa: { galeria: 'cover-evil' }, fuso: 'Mars/Olympus', minhaPresenca: 'sim', contagens: { vou: -4, talvez: 'x' }, vagasRestantes: -1 }))
    expect(c.capa).toBeNull()
    expect(c.fuso).toBe('UTC')
    expect(c.minhaPresenca).toBeNull()
    expect(c.contagens).toEqual({ vou: 0, talvez: 0, naoVou: 0 })
    expect(c.vagasRestantes).toBeNull()
  })
  it('the title loses page markup and line breaks; invisible characters go; an end before the start is dropped', () => {
    const c = eventCard(relayCard({ titulo: 'Noite\n<de> jogos​', fim: START - 60 }))
    expect(c.titulo).toBe('Noite de jogos')
    expect(c.fim).toBeNull()
  })
  it('a card without the contract shape is refused (bad id, bad instant, bad state)', () => {
    expect(() => eventCard(relayCard({ id: 'ob_curto' }))).toThrow()
    expect(() => eventCard(relayCard({ inicio: 'amanhã' }))).toThrow()
    expect(() => eventCard(relayCard({ estado: 'talvez' }))).toThrow()
    expect(() => eventCard(relayCard({ organizador: { uid: 'x' } }))).toThrow()
  })
  it('a cancelled event counts as closed; 18+ and edit marks come only when true', () => {
    const c = eventCard(relayCard({ estado: 'cancelado', encerrado: false, adulto: true, editado: true, editadoEm: START - 3600, canceladoEm: START - 60 }))
    expect(c.encerrado).toBe(true)
    expect(c.adulto).toBe(true)
    expect(c.editadoEm).toBe(START - 3600)
    expect(c.canceladoEm).toBe(START - 60)
    expect(eventCard(relayCard({ adulto: false }))).not.toHaveProperty('adulto')
  })
  it('a list keeps the good items, leaves the broken ones out, has a ceiling and reads the cursor', () => {
    const l = eventList({ itens: [relayCard(), { lixo: true }, relayCard({ id: EVENT_ID_2 })], proximo: 24 })
    expect(l.itens.map((e) => e.id)).toEqual([EVENT_ID, EVENT_ID_2])
    expect(l.proximo).toBe('24')
    expect(eventList({ itens: [], proximo: null })).toEqual({ itens: [] })
    expect(eventList({ itens: Array.from({ length: 80 }, () => relayCard()) }).itens).toHaveLength(50)
    expect(() => eventList({ eventos: [] })).toThrow()
  })
  it('the detail keeps the number of versions and not the envelope; the attendees are rover summaries with the time', () => {
    const d = eventDetail({ ...relayDetail(), versoes: 3 })
    expect(d.versoes).toBe(3)
    expect(d).not.toHaveProperty('envelope')
    const a = attendeeList({ itens: [relayAttendee(ANA), relayAttendee(BIA), { uid: 'nope' }], proximo: null })
    expect(a.itens.map((x) => [x.rover.handle, x.rover.nome])).toEqual([['ana.souza', 'Ana Souza'], ['bia.lima', 'Bia Lima']])
  })
  it('info: `eventos` in recursos turns events on; limits may be lower than the protocol, never higher', () => {
    expect(eventsInfo({ recursos: ['eventos'], eventos: { tituloCaracteres: 80, vagasMax: 999999999, duracaoMaxS: 'x' } })).toEqual({ on: true, limits: { ...DEFAULT_LIMITS, tituloCaracteres: 80 } })
    expect(eventsInfo({ recursos: ['midia'] }).on).toBe(false)
    expect(eventsInfo(null)).toEqual({ on: false, limits: DEFAULT_LIMITS })
  })
})

describe('time zones', () => {
  it('a wall time in a zone becomes the protocol instant and back', () => {
    expect(zonedToInstant('2026-12-05', '20:00', 'America/Sao_Paulo')).toBe(START)
    expect(zonedToInstant('2026-12-05', '20:00', 'Asia/Tokyo')).toBe(Date.UTC(2026, 11, 5, 11, 0) / 1000)
    expect(zonedToInstant('2026-07-01', '09:30', 'Europe/Lisbon')).toBe(Date.UTC(2026, 6, 1, 8, 30) / 1000)
    expect(instantToZoned(START, 'America/Sao_Paulo')).toEqual({ date: '2026-12-05', time: '20:00' })
    expect(instantToZoned(START, 'Europe/Lisbon')).toEqual({ date: '2026-12-05', time: '23:00' })
    expect(dayIn(START, 'Asia/Tokyo')).toBe('2026-12-06')
  })
  it('an hour skipped by daylight saving lands right after the gap; invalid dates and zones give null', () => {
    // New York jumps from 02:00 to 03:00 on 8 Mar 2026
    expect(zonedToInstant('2026-03-08', '02:30', 'America/New_York')).toBe(Date.UTC(2026, 2, 8, 7, 30) / 1000)
    expect(zonedToInstant('2026-02-30', '10:00', 'UTC')).toBeNull()
    expect(zonedToInstant('2026-12-05', '25:00', 'UTC')).toBeNull()
    expect(zonedToInstant('2026-12-05', '20:00', 'Mars/Base')).toBeNull()
    expect(isZone('America/Sao_Paulo')).toBe(true)
    expect(isZone('../../etc')).toBe(false)
  })
})

describe('dates in words', () => {
  it('in the event zone, the range with the language word, no dash; another day writes its date', () => {
    const s = whenText(START, START + 3 * 3600, 'America/Sao_Paulo', 'pt', t.until, NOW)
    expect(s).toMatch(/^sáb\., 5 de dez\., 20:00 até 23:00 \(.+\)$/)
    expect(s).not.toMatch(/[–—]/)
    expect(whenText(START, START + 2 * 86400, 'America/Sao_Paulo', 'en', EVENT_TEXTS.en.until, NOW)).toMatch(/^Sat, Dec 5, 08:00 PM to Mon, Dec 7, 08:00 PM \(.+\)$/)
    expect(whenText(START, null, 'UTC', 'pt', t.until, NOW)).toMatch(/^sáb\., 5 de dez\., 23:00 \(UTC\)$/)
    expect(dayBadge(START, 'America/Sao_Paulo', 'pt')).toBe('SÁB 5')
    expect(dayBadge(START, 'Asia/Tokyo', 'pt')).toBe('DOM 6')
  })
  it('"today" is the day in the event zone, or an event happening now', () => {
    const e = { inicio: START, fim: null, fuso: 'America/Sao_Paulo' }
    expect(isToday(e, new Date(Date.UTC(2026, 11, 5, 14, 0)))).toBe(true)
    expect(isToday(e, new Date(Date.UTC(2026, 11, 6, 2, 0)))).toBe(true)
    expect(isToday(e, new Date(Date.UTC(2026, 11, 4, 14, 0)))).toBe(false)
  })
  it('the filters taken from the upcoming list: today and online', () => {
    const items = [eventCard(relayCard()), eventCard(relayCard({ id: EVENT_ID_2, online: true, lugar: null, inicio: Math.floor(NOW.getTime() / 1000) + 3600, fim: null }))]
    expect(filterEvents(items, 'online', NOW).map((e) => e.id)).toEqual([EVENT_ID_2])
    expect(filterEvents(items, 'hoje', NOW).map((e) => e.id)).toEqual([EVENT_ID_2])
    expect(filterEvents(items, 'semana', NOW)).toHaveLength(2)
  })
})

describe('the body the form signs', () => {
  const now = Math.floor(NOW.getTime() / 1000)
  const form = (x: Partial<EventForm> = {}): EventForm => ({
    titulo: '  Noite de jogos ', descricao: 'Tragam\tjogos.', inicioData: '2026-12-05', inicioHora: '20:00', fimData: '2026-12-05', fimHora: '23:00', fuso: 'America/Sao_Paulo',
    online: false, lugar: 'Praça da Liberdade', capa: 'cover-stars', vagas: '10', comunidade: '', adulto: false, ...x,
  })
  it('a good form becomes the exact body of evento-criar and evento-editar', () => {
    const c = checkForm(form(), now)
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(createBody(c.content, COMMUNITY_ID)).toEqual({
      comunidade: COMMUNITY_ID, titulo: 'Noite de jogos', descricao: 'Tragam jogos.', inicio: START, fim: START + 3 * 3600, fuso: 'America/Sao_Paulo',
      online: false, lugar: 'Praça da Liberdade', capa: { galeria: 'cover-stars' }, vagas: 10,
    })
    expect(createBody(c.content, null).comunidade).toBeNull()
    expect(editBody(c.content, EVENT_ID)).toEqual({ evento: EVENT_ID, ...c.content })
    expect(editBody(c.content, EVENT_ID)).not.toHaveProperty('comunidade')
  })
  it('online without a link carries null; with one https link, the link; 18+ only when marked', () => {
    const a = checkForm(form({ online: true, lugar: '', capa: '', vagas: '', adulto: true }), now)
    expect(a.ok && a.content).toMatchObject({ online: true, lugar: null, capa: null, vagas: null, adulto: true })
    const b = checkForm(form({ online: true, lugar: 'https://meet.example.org/abc' }), now)
    expect(b.ok && b.content.lugar).toBe('https://meet.example.org/abc')
  })
  it('the end must come after the start and within 30 days; an end with only a date is incomplete', () => {
    expect(checkForm(form({ fimHora: '19:00' }), now)).toEqual({ ok: false, problems: ['endBefore'] })
    expect(checkForm(form({ fimData: '2027-01-10' }), now)).toEqual({ ok: false, problems: ['endLong'] })
    expect(checkForm(form({ fimHora: '' }), now)).toEqual({ ok: false, problems: ['endIncomplete'] })
    expect(checkForm(form({ fimData: '', fimHora: '' }), now).ok).toBe(true)
  })
  it('in person needs a place; the start is in the future and within 2 years, except the kept start of an edit', () => {
    expect(checkForm(form({ lugar: '   ' }), now)).toEqual({ ok: false, problems: ['placeMissing'] })
    expect(checkForm(form({ lugar: 'x' }), now)).toEqual({ ok: false, problems: ['placeLength'] })
    const past = form({ inicioData: '2026-11-20', fimData: '2026-11-20' })
    expect(checkForm(past, now)).toEqual({ ok: false, problems: ['startPast'] })
    expect(checkForm(past, now, { keptStart: zonedToInstant('2026-11-20', '20:00', 'America/Sao_Paulo')! }).ok).toBe(true)
    expect(checkForm(form({ inicioData: '2029-01-01', fimData: '', fimHora: '' }), now)).toEqual({ ok: false, problems: ['startFar'] })
    expect(checkForm(form({ inicioData: '' }), now).ok).toBe(false)
  })
  it('title, links, HTML, spots and leaks follow the relay rules', () => {
    expect(checkForm(form({ titulo: 'ab' }), now)).toEqual({ ok: false, problems: ['titleLength'] })
    expect(checkForm(form({ titulo: 'x'.repeat(101) }), now)).toEqual({ ok: false, problems: ['titleLength'] })
    expect(checkForm(form({ titulo: 'Veja https://exemplo.com.br' }), now)).toEqual({ ok: false, problems: ['titleLink'] })
    expect(checkForm(form({ descricao: 'a https://a.com b https://b.com c https://c.com' }), now)).toEqual({ ok: false, problems: ['descLinks'] })
    expect(checkForm(form({ descricao: 'http://inseguro.com' }), now)).toEqual({ ok: false, problems: ['descLinks'] })
    expect(checkForm(form({ descricao: '<script>x</script>' }), now)).toEqual({ ok: false, problems: ['markup'] })
    expect(checkForm(form({ online: true, lugar: 'https://bit.ly/x' }), now)).toEqual({ ok: false, problems: ['linkBad'] })
    expect(checkForm(form({ online: true, lugar: 'sala do zoom' }), now)).toEqual({ ok: false, problems: ['linkBad'] })
    expect(checkForm(form({ vagas: '0' }), now)).toEqual({ ok: false, problems: ['spotsBad'] })
    expect(checkForm(form({ vagas: '2.5' }), now)).toEqual({ ok: false, problems: ['spotsBad'] })
    expect(checkForm(form({ vagas: '100001' }), now)).toEqual({ ok: false, problems: ['spotsBad'] })
    expect(checkForm(form({ descricao: 'minha senha é hunter2hunter2 e o cartão 4111 1111 1111 1111' }), now)).toMatchObject({ ok: false, problems: expect.arrayContaining(['leak']) })
    expect(checkForm(form({ fuso: 'Lua/Base' }), now)).toEqual({ ok: false, problems: ['zoneBad'] })
  })
})

describe('refusals in words', () => {
  const refuse = (code: string, extra: Record<string, unknown> = {}) => eventRefusal(new PersonError(409, code, extra), t.refusals, 'pt')
  it('full suggests Talvez, over says answers are closed, and the others have their own sentence', () => {
    expect(refuse('evento_lotado')).toBe(t.refusals.full)
    expect(refuse('evento_lotado')).toMatch(/Talvez/)
    expect(refuse('evento_encerrado')).toBe(t.refusals.closed)
    expect(refuse('nao_e_autor')).toBe(t.refusals.notOrganizer)
    expect(refuse('sem_permissao')).toBe(t.refusals.notMember)
    expect(refuse('limite_de_estrutura')).toBe(t.refusals.structure)
    expect(refuse('vazamento')).toBe(t.refusals.leak)
    expect(refuse('qualquer')).toBe(t.refusals.generic)
  })
  it('a wait from the relay is said in words; none says "later"', () => {
    expect(refuse('conta_nova', { retryAfterS: 3 * 3600 + 60 })).toBe(`${t.refusals.young} Libera em 3 horas e 1 minuto.`)
    expect(refuse('limite_de_taxa', { retryAfterS: 45 })).toBe(`${t.refusals.rate} Libera em 45 segundos.`)
    expect(refuse('limite_de_taxa')).toBe(`${t.refusals.rate} ${t.refusals.later}`)
  })
})

describe('the texts', () => {
  it('every language has every text, with no dash in any of them', () => {
    const flat = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as object).flatMap(flat))
    const count = flat(EVENT_TEXTS.pt).length
    for (const l of LOCALES) {
      const all = flat(EVENT_TEXTS[l])
      expect(all, l).toHaveLength(count)
      expect(all.filter((s) => /[–—]/.test(s)), l).toEqual([])
      expect(all.filter((s) => s.trim() === ''), l).toEqual([])
    }
  })
  it('an online link becomes a link only when it is plain https', () => {
    expect(callLink('https://meet.example.org/abc')).toBe('https://meet.example.org/abc')
    expect(callLink('javascript:alert(1)')).toBeNull()
    expect(callLink('http://meet.example.org')).toBeNull()
    expect(callLink('https://user:pw@evil.example')).toBeNull()
    expect(callLink(null)).toBeNull()
  })
})

describe('reading the relay (server)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('FOLGALI_CLIENT', 'http')
    vi.stubEnv('FOLGALI_RELAY_URL', 'http://rele.local:7777/')
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

  it('the address only with the http client and a real URL', () => {
    expect(relayAddress({ FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: 'https://rele.folgali.com/' })).toBe('https://rele.folgali.com')
    expect(relayAddress({ FOLGALI_CLIENT: 'falso', FOLGALI_RELAY_URL: 'https://x' })).toBeNull()
    expect(relayAddress({ FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: 'file:///etc' })).toBeNull()
  })
  it('lists with the relay query, dropping odd options before the request leaves; nothing is cached', async () => {
    reply({ itens: [relayCard()], proximo: null })
    await listEvents({ quando: 'semana', comunidade: COMMUNITY_ID, antes: '24', limite: 99 })
    expect(fetchMock.mock.calls[0][0]).toBe(`http://rele.local:7777/v1/eventos?quando=semana&comunidade=${COMMUNITY_ID}&antes=24&limite=50`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit' })
    reply({ itens: [] })
    await listEvents({ quando: 'amanha' as never, comunidade: '../admin', de: 'x', antes: '-1' })
    expect(fetchMock.mock.calls[1][0]).toBe('http://rele.local:7777/v1/eventos?quando=proximos')
  })
  it('one event and who goes; a refusal becomes the site error code; a bad id never becomes a path', async () => {
    reply(relayDetail())
    expect((await readEvent(EVENT_ID)).titulo).toBe('Noite de jogos')
    reply({ itens: [relayAttendee(BIA)] })
    expect((await attendees(EVENT_ID, 'talvez')).itens[0].rover.nome).toBe('Bia Lima')
    expect(fetchMock.mock.calls[1][0]).toBe(`http://rele.local:7777/v1/eventos/${EVENT_ID}/presencas?resposta=talvez&limite=30`)
    reply({ erro: { codigo: 'nao_encontrado', mensagem: 'x' } }, 404)
    await expect(readEvent(EVENT_ID)).rejects.toMatchObject({ codigo: 'nao-encontrado' })
    await expect(readEvent('../../v1/info')).rejects.toMatchObject({ codigo: 'nao-encontrado' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('events are on only when the relay announces them; a relay that does not answer has none', async () => {
    reply({ recursos: ['eventos'], eventos: { tituloCaracteres: 100 } })
    expect((await eventsOnRelay()).on).toBe(true)
    fetchMock.mockRejectedValueOnce(new Error('down'))
    expect((await eventsOnRelay()).on).toBe(false)
  })
})

describe('the route of the person (her answer and her communities)', () => {
  const req = (body?: unknown) => new Request('http://site/api/person/events', body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) as never
  const credential = (uid: string) => `Rover-Assinatura uid=${uid}, t=1764000000, a=${'A'.repeat(86)}`
  beforeEach(() => {
    h.who = { pessoa: 'p_ana', nome: 'Ana', at: 'rmapp_at_x' }
    h.relay.mockReset()
    h.communities.mockReset()
  })
  it('carries her signed read of one event and keeps only minhaPresenca', async () => {
    h.relay.mockResolvedValueOnce({ status: 200, json: { ...relayDetail(), minhaPresenca: 'talvez' } })
    const r = await POST(req({ path: `/v1/eventos/${EVENT_ID}`, credential: credential(ANA.uid) }))
    expect(await r.json()).toEqual({ minhaPresenca: 'talvez' })
    expect(h.relay).toHaveBeenCalledWith('http://rele', `/v1/eventos/${EVENT_ID}`, credential(ANA.uid))
  })
  it('refuses another path, another reader, extra fields and a visitor', async () => {
    expect((await POST(req({ path: '/v1/eventos', credential: credential(ANA.uid) }))).status).toBe(400)
    expect((await POST(req({ path: `/v1/eventos/${EVENT_ID}/presencas`, credential: credential(ANA.uid) }))).status).toBe(400)
    expect((await POST(req({ path: `/v1/eventos/${EVENT_ID}`, credential: credential(BIA.uid) }))).status).toBe(403)
    expect((await POST(req({ path: `/v1/eventos/${EVENT_ID}`, credential: credential(ANA.uid), mais: 1 }))).status).toBe(400)
    h.who = null
    expect((await POST(req({ path: `/v1/eventos/${EVENT_ID}`, credential: credential(ANA.uid) }))).status).toBe(401)
    expect(h.relay).not.toHaveBeenCalled()
  })
  it('lists her communities (id and name only); a failure gives an empty list', async () => {
    h.communities.mockResolvedValueOnce({ itens: [{ comunidade: { id: COMMUNITY_ID, nome: 'Jogos de tabuleiro', membros: 30 }, papel: 'membro' }] })
    expect(await (await GET(req())).json()).toEqual({ comunidades: [{ id: COMMUNITY_ID, nome: 'Jogos de tabuleiro' }] })
    h.communities.mockRejectedValueOnce(new Error('down'))
    expect(await (await GET(req())).json()).toEqual({ comunidades: [] })
  })
})
