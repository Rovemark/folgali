import { describe, expect, it } from 'vitest'
import { MEIA_VIDA_HORAS, pontuar, rankear } from '@/lib/dominio/alta'
import { LivroDeDenuncias, TETO_GLOBAL_POR_HORA, TETO_POR_ALVO, corpoDaDenuncia, validarDenuncia } from '@/lib/dominio/denuncia'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import type { Postagem } from '@/lib/tipos'

const alvo = idDeDemonstracao('ob', 'p01')
const AGORA = new Date('2026-11-04T12:00:00.000Z')

describe('validarDenuncia', () => {
  it('aceita objeto e motivo do protocolo', () => {
    for (const motivo of ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro'] as const) {
      expect(validarDenuncia({ alvo, motivo })).toEqual({ ok: true, denuncia: { alvo, motivo } })
    }
  })
  it('recusa alvo que não é objeto e motivo desconhecido', () => {
    expect(validarDenuncia({ alvo: idDeDemonstracao('rvr', 'pipa'), motivo: 'spam' })).toEqual({ ok: false, erro: 'alvo' })
    expect(validarDenuncia({ alvo: 'qualquer coisa', motivo: 'spam' })).toEqual({ ok: false, erro: 'alvo' })
    expect(validarDenuncia({ alvo, motivo: 'chato' as never })).toEqual({ ok: false, erro: 'motivo' })
    expect(validarDenuncia({ alvo, motivo: undefined as never })).toEqual({ ok: false, erro: 'motivo' })
  })
  it('o corpo enviado tem só alvo e motivo, mesmo que a entrada traga mais', () => {
    const v = validarDenuncia({ alvo, motivo: 'spam', quem: 'rvr_x', ip: '1.2.3.4', cookie: 'c' } as never)
    expect(v.ok).toBe(true)
    if (v.ok) expect(Object.keys(corpoDaDenuncia(v.denuncia)).sort()).toEqual(['alvo', 'motivo'])
  })
})

describe('LivroDeDenuncias', () => {
  const d = { alvo, motivo: 'spam' as const }
  it('guarda cada denúncia por alvo, sem saber quem enviou', () => {
    const l = new LivroDeDenuncias()
    expect(l.receber(d, AGORA)).toBe('nova')
    expect(l.receber(d, AGORA)).toBe('nova')
    expect(l.total(alvo)).toBe(2)
    expect(l.total(idDeDemonstracao('ob', 'zzz'))).toBe(0)
  })
  it('a moderação lê o conteúdo, e o registro só tem alvo, motivo e instante', () => {
    const l = new LivroDeDenuncias()
    l.receber(d, AGORA)
    expect(l.paraModeracao(alvo)).toEqual([{ alvo, motivo: 'spam', em: AGORA.toISOString() }])
    expect(l.paraModeracao(idDeDemonstracao('ob', 'zzz'))).toEqual([])
  })
  it('limita por alvo (o teto vale, o seguinte é recusado)', () => {
    const l = new LivroDeDenuncias()
    for (let i = 0; i < TETO_POR_ALVO; i++) expect(l.receber(d, AGORA)).toBe('nova')
    expect(l.receber(d, AGORA)).toBe('limite')
    expect(l.total(alvo)).toBe(TETO_POR_ALVO)
    expect(l.receber({ alvo: idDeDemonstracao('ob', 'outro'), motivo: 'spam' }, AGORA)).toBe('nova')
  })
  it('limita no total por hora, somando todo mundo, e libera depois de uma hora', () => {
    const l = new LivroDeDenuncias()
    for (let i = 0; i < TETO_GLOBAL_POR_HORA; i++) expect(l.receber({ alvo: idDeDemonstracao('ob', `a${i}`), motivo: 'spam' }, AGORA)).toBe('nova')
    expect(l.receber({ alvo: idDeDemonstracao('ob', 'extra'), motivo: 'spam' }, AGORA)).toBe('limite')
    expect(l.receber({ alvo: idDeDemonstracao('ob', 'extra'), motivo: 'spam' }, new Date(AGORA.getTime() + 3_599_000))).toBe('limite')
    expect(l.receber({ alvo: idDeDemonstracao('ob', 'extra'), motivo: 'spam' }, new Date(AGORA.getTime() + 3_600_000))).toBe('nova')
  })
})

const post = (extra: Partial<Postagem> = {}): Postagem => ({
  id: alvo, tipo: 'postagem', topicos: [], autor: { uid: idDeDemonstracao('rvr', 'pipa'), handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'bolinha', cor: '#86b6ff' } },
  texto: 'x', criadaEm: AGORA.toISOString(), respostas: 0, reacoes: { curtir: 0, util: 0 }, ...extra,
})

describe('pontuar e rankear', () => {
  it('reação vale 1 e resposta vale 2', () => {
    expect(pontuar(post({ reacoes: { curtir: 3, util: 2 }, respostas: 4 }), AGORA)).toBe(13)
  })
  it('cai pela metade a cada meia-vida', () => {
    const base = post({ reacoes: { curtir: 8, util: 0 } })
    const velho = post({ reacoes: { curtir: 8, util: 0 }, criadaEm: new Date(AGORA.getTime() - MEIA_VIDA_HORAS * 3_600_000).toISOString() })
    expect(pontuar(base, AGORA)).toBe(8)
    expect(pontuar(velho, AGORA)).toBeCloseTo(4, 10)
  })
  it('postagem apagada e postagem do futuro não distorcem', () => {
    expect(pontuar(post({ removida: true, reacoes: { curtir: 99, util: 0 } }), AGORA)).toBe(0)
    expect(pontuar(post({ reacoes: { curtir: 5, util: 0 }, criadaEm: new Date(AGORA.getTime() + 3_600_000).toISOString() }), AGORA)).toBe(5)
  })
  it('rankeia por soma de pontos e desempata pelo uid', () => {
    const a = idDeDemonstracao('rvr', 'a')
    const b = idDeDemonstracao('rvr', 'b')
    const c = idDeDemonstracao('rvr', 'c')
    const com = (uid: string, n: number, id: string) => post({ id: idDeDemonstracao('ob', id), autor: { ...post().autor, uid }, reacoes: { curtir: n, util: 0 } })
    const r = rankear([com(a, 3, 'x1'), com(a, 4, 'x2'), com(b, 7, 'x3'), com(c, 0, 'x4')], AGORA)
    expect(r).toEqual([{ uid: a, pontos: 7 }, { uid: b, pontos: 7 }])
    expect(rankear([com(b, 2, 'y1'), com(a, 5, 'y2')], AGORA).map((x) => x.uid)).toEqual([a, b])
  })
})
