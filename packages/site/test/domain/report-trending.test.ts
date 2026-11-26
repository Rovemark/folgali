import { describe, expect, it } from 'vitest'
import { HALF_LIFE_HOURS, score, rank } from '@/lib/domain/trending'
import { ReportLedger, GLOBAL_CAP_PER_HOUR, CAP_PER_TARGET, reportBody, validateReport } from '@/lib/domain/report'
import { demoId } from '@/lib/domain/ids'
import type { Post } from '@/lib/types'

const target = demoId('ob', 'p01')
const NOW = new Date('2026-11-04T12:00:00.000Z')

describe('validarDenuncia', () => {
  it('accepts a protocol object and reason', () => {
    for (const reason of ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro'] as const) {
      expect(validateReport({ alvo: target, motivo: reason })).toEqual({ ok: true, denuncia: { alvo: target, motivo: reason } })
    }
  })
  it('refuses a target that is not an object and an unknown reason', () => {
    expect(validateReport({ alvo: demoId('rvr', 'pipa'), motivo: 'spam' })).toEqual({ ok: false, erro: 'alvo' })
    expect(validateReport({ alvo: 'qualquer coisa', motivo: 'spam' })).toEqual({ ok: false, erro: 'alvo' })
    expect(validateReport({ alvo: target, motivo: 'chato' as never })).toEqual({ ok: false, erro: 'motivo' })
    expect(validateReport({ alvo: target, motivo: undefined as never })).toEqual({ ok: false, erro: 'motivo' })
  })
  it('the body sent has only target and reason, even if the input brings more', () => {
    const v = validateReport({ alvo: target, motivo: 'spam', quem: 'rvr_x', ip: '1.2.3.4', cookie: 'c' } as never)
    expect(v.ok).toBe(true)
    if (v.ok) expect(Object.keys(reportBody(v.denuncia)).sort()).toEqual(['alvo', 'motivo'])
  })
})

describe('LivroDeDenuncias', () => {
  const d = { alvo: target, motivo: 'spam' as const }
  it('keeps each report by target, without knowing who sent it', () => {
    const l = new ReportLedger()
    expect(l.receive(d, NOW)).toBe('nova')
    expect(l.receive(d, NOW)).toBe('nova')
    expect(l.total(target)).toBe(2)
    expect(l.total(demoId('ob', 'zzz'))).toBe(0)
  })
  it('moderation reads the content, and the log only has target, reason and instant', () => {
    const l = new ReportLedger()
    l.receive(d, NOW)
    expect(l.forModeration(target)).toEqual([{ alvo: target, motivo: 'spam', em: NOW.toISOString() }])
    expect(l.forModeration(demoId('ob', 'zzz'))).toEqual([])
  })
  it('limits by target (the ceiling holds, the next one is refused)', () => {
    const l = new ReportLedger()
    for (let i = 0; i < CAP_PER_TARGET; i++) expect(l.receive(d, NOW)).toBe('nova')
    expect(l.receive(d, NOW)).toBe('limite')
    expect(l.total(target)).toBe(CAP_PER_TARGET)
    expect(l.receive({ alvo: demoId('ob', 'outro'), motivo: 'spam' }, NOW)).toBe('nova')
  })
  it('limits the total per hour, adding up everybody, and releases after an hour', () => {
    const l = new ReportLedger()
    for (let i = 0; i < GLOBAL_CAP_PER_HOUR; i++) expect(l.receive({ alvo: demoId('ob', `a${i}`), motivo: 'spam' }, NOW)).toBe('nova')
    expect(l.receive({ alvo: demoId('ob', 'extra'), motivo: 'spam' }, NOW)).toBe('limite')
    expect(l.receive({ alvo: demoId('ob', 'extra'), motivo: 'spam' }, new Date(NOW.getTime() + 3_599_000))).toBe('limite')
    expect(l.receive({ alvo: demoId('ob', 'extra'), motivo: 'spam' }, new Date(NOW.getTime() + 3_600_000))).toBe('nova')
  })
})

const post = (extra: Partial<Post> = {}): Post => ({
  id: target, tipo: 'postagem', topicos: [], autor: { uid: demoId('rvr', 'pipa'), handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'bolinha', cor: '#86b6ff' } },
  texto: 'x', criadaEm: NOW.toISOString(), respostas: 0, reacoes: { curtir: 0, util: 0 }, ...extra,
})

describe('pontuar e rankear', () => {
  it('a reaction is worth 1 and a reply is worth 2', () => {
    expect(score(post({ reacoes: { curtir: 3, util: 2 }, respostas: 4 }), NOW)).toBe(13)
  })
  it('halves at every half-life', () => {
    const base = post({ reacoes: { curtir: 8, util: 0 } })
    const old = post({ reacoes: { curtir: 8, util: 0 }, criadaEm: new Date(NOW.getTime() - HALF_LIFE_HOURS * 3_600_000).toISOString() })
    expect(score(base, NOW)).toBe(8)
    expect(score(old, NOW)).toBeCloseTo(4, 10)
  })
  it('a deleted post and a post from the future do not distort', () => {
    expect(score(post({ removida: true, reacoes: { curtir: 99, util: 0 } }), NOW)).toBe(0)
    expect(score(post({ reacoes: { curtir: 5, util: 0 }, criadaEm: new Date(NOW.getTime() + 3_600_000).toISOString() }), NOW)).toBe(5)
  })
  it('ranks by sum of points and breaks ties by uid', () => {
    const a = demoId('rvr', 'a')
    const b = demoId('rvr', 'b')
    const c = demoId('rvr', 'c')
    const using = (uid: string, n: number, id: string) => post({ id: demoId('ob', id), autor: { ...post().autor, uid }, reacoes: { curtir: n, util: 0 } })
    const r = rank([using(a, 3, 'x1'), using(a, 4, 'x2'), using(b, 7, 'x3'), using(c, 0, 'x4')], NOW)
    expect(r).toEqual([{ uid: a, pontos: 7 }, { uid: b, pontos: 7 }])
    expect(rank([using(b, 2, 'y1'), using(a, 5, 'y2')], NOW).map((x) => x.uid)).toEqual([a, b])
  })
})
