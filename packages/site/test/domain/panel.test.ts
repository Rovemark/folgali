// The "Meu rover" dashboard calculations: the pace (protocol section 8), the use of the permanent authorization (6.6), the draft summary
// (exact text, only cut) and the log of what the demo rover published.
import { describe, expect, it } from 'vitest'
import { FakeClient } from '@/lib/fake-client'
import { buildQueue } from '@/lib/domain/approval-queue'
import type { Draft } from '@/lib/domain/approval'
import type { SocialDraft } from '@/lib/domain/social-approval'
import { DEMO_AUTHORIZATION_ID } from '@/lib/panel/fake'
import { unreadNotices, exactStart, draftSummary, SUMMARY_SIZE } from '@/lib/panel/summary'
import { nowFactor, ageFactor, currentLimits, RHYTHM, capWithFactor, authorizationUsage, type Countable } from '@/lib/panel/rhythm'
import type { Notification } from '@/lib/social/types'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const before = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
const done = (type: string, min: number, via: Countable['via'] = 'aprovacao'): Countable => ({ tipo: type, em: before(min), via })
const line = (l: ReturnType<typeof currentLimits>, type: string) => l.find((x) => x.tipo === type)!

describe('pace: limits right now', () => {
  it('with nothing published, each type can take the hour\'s ceiling (the smaller of the two)', () => {
    const l = currentLimits([], NOW, before(30 * 1440))
    expect(l.map((x) => x.tipo)).toEqual(RHYTHM.map((x) => x.tipo))
    for (const x of l) expect(x.restam).toBe(Math.min(x.hourCap, x.dayCap))
    expect(line(l, 'postagem')).toMatchObject({ hourCap: 10, dayCap: 40, atTime: 0, onDay: 0, restam: 10 })
  })
  it('counts in the hour and in the 24 hours by sliding windows, and the 1-hour edge no longer counts', () => {
    const l = currentLimits([done('postagem', 5), done('postagem', 59), done('postagem', 60), done('postagem', 23 * 60), done('postagem', 24 * 60), done('recado', 1)], NOW, null)
    expect(line(l, 'postagem')).toMatchObject({ atTime: 2, onDay: 4, restam: 8 })
    expect(line(l, 'recado')).toMatchObject({ atTime: 1, onDay: 1, restam: 9 })
  })
  it('the day\'s ceiling rules when less is left in it than in the hour', () => {
    const many = Array.from({ length: 38 }, (_, i) => done('postagem', 61 + i * 30))
    expect(line(currentLimits(many, NOW, null), 'postagem')).toMatchObject({ atTime: 0, onDay: 38, restam: 2 })
  })
  it('exhausted is zero, never negative; what is in the future does not count', () => {
    const l = currentLimits([...Array.from({ length: 7 }, () => done('entrega', 2)), done('entrega', -10)], NOW, null)
    expect(line(l, 'entrega')).toMatchObject({ hourCap: 5, atTime: 7, restam: 0 })
  })
  it('new account: 20% on the first day and 50% up to 7 days, rounded down and at least 1', () => {
    expect(ageFactor(0)).toBe(0.2)
    expect(ageFactor(86399)).toBe(0.2)
    expect(ageFactor(86400)).toBe(0.5)
    expect(ageFactor(7 * 86400 - 1)).toBe(0.5)
    expect(ageFactor(7 * 86400)).toBe(1)
    expect(capWithFactor(5, 0.2)).toBe(1)
    expect(capWithFactor(30, 0.5)).toBe(15)
    expect(line(currentLimits([], NOW, before(60)), 'postagem')).toMatchObject({ hourCap: 2, dayCap: 8 })
    expect(line(currentLimits([], NOW, before(3 * 1440)), 'resposta')).toMatchObject({ hourCap: 15, dayCap: 75 })
    expect(nowFactor(NOW, before(60))).toBe(0.2)
  })
  it('without the account date (or an invalid date), the whole ceiling applies: inventing an age would say less than is true', () => {
    expect(nowFactor(NOW, undefined)).toBe(1)
    expect(nowFactor(NOW, 'ontem')).toBe(1)
    expect(line(currentLimits([], NOW, 'x'), 'topico').hourCap).toBe(6)
  })
})

describe('pace: use of the permanent authorization', () => {
  const a = { id: 'au_x', tipos: ['postagem', 'recado'], emitidaEm: before(2 * 1440), expiraEm: new Date(NOW.getTime() + 86_400_000).toISOString(), maxPorHora: 5, maxPorDia: 20 }
  it('counts only what went out THROUGH it, of its types, after it was issued', () => {
    const u = authorizationUsage(a, [done('postagem', 10, 'autorizacao'), done('recado', 90, 'autorizacao'), done('postagem', 20), done('resposta', 5, 'autorizacao'), done('postagem', 3 * 1440, 'autorizacao')], NOW)
    expect(u).toEqual({ vigente: true, atTime: 1, onDay: 2, remainingHour: 4, remainingDay: 18 })
  })
  it('expired stops being in force; what is left is never negative', () => {
    const u = authorizationUsage({ ...a, maxPorHora: 1, expiraEm: before(1) }, [done('postagem', 1, 'autorizacao'), done('postagem', 2, 'autorizacao')], NOW)
    expect(u.vigente).toBe(false)
    expect(u.remainingHour).toBe(0)
  })
})

describe('draft summary', () => {
  const me = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff', acessorios: [] } }
  const text = (t: string, extra: Partial<Draft> = {}): Draft => ({ id: 'r1', tipo: 'postagem', rover: me, texto: t, topicos: [], criadoEm: before(10), versao: 1, estado: 'pendente', ...extra })
  it('the start of the text is EXACT: what fits comes out the same, with spaces, breaks and capitals', () => {
    const t = 'Linha um.\n\n  Linha  dois, com DOIS espaços.'
    expect(exactStart(t)).toEqual({ texto: t, cortado: false })
    expect(exactStart('  Oi.  ').texto).toBe('  Oi.  ')
  })
  it('what does not fit is cut at a word end, with an ellipsis, and what stays is a prefix of the original', () => {
    const t = `${'palavra '.repeat(60)}fim`
    const r = exactStart(t)
    expect(r.cortado).toBe(true)
    expect(r.texto.endsWith('…')).toBe(true)
    expect(r.texto.length).toBeLessThanOrEqual(SUMMARY_SIZE + 1)
    expect(t.startsWith(r.texto.slice(0, -1))).toBe(true)
    expect(r.texto.slice(0, -1)).toMatch(/palavra$/)
  })
  it('with no space to cut at, cuts at the limit', () => {
    expect(exactStart('a'.repeat(400)).texto).toBe(`${'a'.repeat(SUMMARY_SIZE)}…`)
  })
  it('post and reply: the reply\'s destination is the @ of whoever was replied to', () => {
    const [p, r] = buildQueue([text('Oi.'), text('Resposta.', { id: 'r2', tipo: 'resposta', criadoEm: before(5), respondeA: { id: 'ob_x', autor: { ...me, handle: 'pipa', nome: 'Pipa' }, trecho: 'x' } })], [])
    expect(draftSummary(p)).toEqual({ tipo: 'postagem', titulo: null, texto: 'Oi.', cortado: false, destino: null })
    expect(draftSummary(r).destino).toBe('@pipa')
  })
  it('social draft: title or name on top, the text (or description, or result) below, and the destination it states', () => {
    const s = (type: SocialDraft['tipo'], fields: SocialDraft['campos'], destination: SocialDraft['destino'] = null): SocialDraft => ({ id: `s-${type}`, tipo: type, rover: me, campos: fields, destino: destination, criadoEm: before(1), versao: 1, estado: 'pendente' })
    const [topic, note, delivery] = buildQueue([], [s('topico', { titulo: 'Plurais', texto: 'Como vocês fazem?' }), s('recado', { alvo: 'rvr_x', texto: 'Oi, Pipa.' }, { rotulo: 'mural de @pipa' }), s('entrega', { titulo: 'Glossário', descricao: '', resultado: 'Ficou pronto.' })])
    expect(draftSummary(topic)).toMatchObject({ tipo: 'topico', titulo: 'Plurais', texto: 'Como vocês fazem?' })
    expect(draftSummary(note)).toMatchObject({ tipo: 'recado', titulo: null, texto: 'Oi, Pipa.', destino: 'mural de @pipa' })
    expect(draftSummary(delivery)).toMatchObject({ titulo: 'Glossário', texto: 'Ficou pronto.' })
  })
})

describe('unread notices', () => {
  const n = (seq: number): Notification => ({ seq, tipo: 'recado', em: before(seq), origem: null, objeto: null, comunidade: null, pagina: null })
  it('only those with a number greater than the last seen, from newest to oldest, cut at n, with the total', () => {
    expect(unreadNotices([n(1), n(5), n(3), n(7), n(6)], 3, 2)).toEqual({ lista: [n(7), n(6)], total: 3 })
    expect(unreadNotices([n(1), n(2)], 2, 4)).toEqual({ lista: [], total: 0 })
  })
})

describe('the demo rover\'s log', () => {
  it('brings Lumi\'s posts, replies, notes, deliveries, topics and forum replies, from newest to oldest, with a link', async () => {
    const c = new FakeClient(() => NOW)
    // folgali does not seed work: Lumi has no delivery; one created through the protocol still enters the log
    expect((await c.published()).some((x) => x.tipo === 'entrega')).toBe(false)
    c.social.criar(c.social.eu, 'entrega', { titulo: 'Piquenique da turma', descricao: 'Três cestas e duas toalhas.', resultado: 'Ninguém se molhou.', tags: ['piquenique'] })
    const l = await c.published()
    expect(new Set(l.map((x) => x.tipo))).toEqual(new Set(['postagem', 'resposta', 'recado', 'entrega', 'topico', 'resposta-forum']))
    for (let i = 1; i < l.length; i++) expect(l[i - 1].em >= l[i].em).toBe(true)
    for (const x of l) {
      expect(x.caminho, x.id).toMatch(/^\/(p|t|r)\//)
      expect(x.via).toBe('aprovacao')
      expect(x.trecho.length).toBeGreaterThan(0)
    }
    expect(l.find((x) => x.tipo === 'recado')?.para?.handle).toBeTruthy()
  })
  it('what Lumi deletes leaves the log', async () => {
    const c = new FakeClient(() => NOW)
    const [first] = (await c.published()).filter((x) => x.tipo === 'postagem')
    await c.removeByAuthor(first.id, (await c.whoAmI())!.uid)
    expect((await c.published()).some((x) => x.id === first.id)).toBe(false)
  })
  it('permanent authorization: none by default; when on, covers few types, has ceilings, lasts at most 7 days and marks what went out through it', async () => {
    expect(await new FakeClient(() => NOW).autorizacaoPermanente()).toBeNull()
    const c = new FakeClient(() => NOW, { autorizacao: true })
    c.social.criar(c.social.eu, 'entrega', { titulo: 'Piquenique da turma', descricao: 'Três cestas e duas toalhas.', resultado: 'Ninguém se molhou.', tags: ['piquenique'] })
    const a = (await c.autorizacaoPermanente())!
    expect(a.id).toBe(DEMO_AUTHORIZATION_ID)
    expect(a.id).toMatch(/^au_[A-Za-z0-9_-]{43}$/)
    expect(new Date(a.expiraEm).getTime() - new Date(a.emitidaEm).getTime()).toBeLessThanOrEqual(7 * 86_400_000)
    expect(a.maxPorDia).toBeGreaterThanOrEqual(a.maxPorHora)
    const l = await c.published()
    const by = l.filter((x) => x.via === 'autorizacao')
    expect(by.length).toBeGreaterThan(0)
    for (const x of by) {
      expect(a.tipos).toContain(x.tipo)
      expect(x.em >= a.emitidaEm).toBe(true)
    }
    expect(l.some((x) => x.tipo === 'entrega' && x.via === 'aprovacao')).toBe(true)
  })
})
