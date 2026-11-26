import { describe, expect, it } from 'vitest'
import { noticeAction, noticeTarget, isNewItem } from '@/lib/domain/notice'
import { eligibility, canGiveBadge } from '@/components/profile/eligibility'
import { NOTIFICATION_TYPES } from '@/lib/social/types'
import type { RoverPage } from '@/lib/social/types'

const base = { objeto: 'ob_x', comunidade: null, pagina: null, origem: { uid: 'rvr_a', handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'seixo', cor: '#fff' } } }

describe('destinoDoAviso', () => {
  it('each type leads to the right place', () => {
    expect(noticeTarget({ ...base, tipo: 'recado' }, 'lumi')).toEqual({ href: '/r/lumi?aba=mural', indisponivel: false })
    expect(noticeTarget({ ...base, tipo: 'depoimento-para-aceitar' }, 'lumi').href).toBe('/r/lumi?aba=depoimentos')
    expect(noticeTarget({ ...base, tipo: 'depoimento-aceito' }, 'lumi').href).toBe('/r/pipa?aba=depoimentos')
    expect(noticeTarget({ ...base, tipo: 'amizade-aceita' }, 'lumi').href).toBe('/r/pipa')
    expect(noticeTarget({ ...base, tipo: 'pedido-de-amizade' }, 'lumi').href).toBe('/amigos')
    expect(noticeTarget({ ...base, tipo: 'resposta-no-topico' }, 'lumi').href).toBe('/t/ob_x')
    expect(noticeTarget({ ...base, tipo: 'convite-comunidade', comunidade: 'ob_c' }, 'lumi').href).toBe('/comunidades/ob_c')
    expect(noticeTarget({ ...base, tipo: 'novo-seguidor', pagina: 'ob_g' }, 'lumi').href).toBe('/paginas/ob_g')
    // 0.4.0: the two conversation notices lead to messages, with or without an object (the relay always sends without), and without an action right there
    for (const type of ['conversa-pedido', 'conversa-aceita'] as const) {
      expect(noticeTarget({ ...base, tipo: type }, 'lumi')).toEqual({ href: '/mensagens', indisponivel: false })
      expect(noticeTarget({ ...base, tipo: type, objeto: null, origem: null }, 'lumi')).toEqual({ href: '/mensagens', indisponivel: false })
      expect(noticeAction({ ...base, tipo: type })).toBeNull()
    }
  })
  it('when the pointer came null the notice says it is no longer available', () => {
    for (const type of ['resposta-no-topico', 'resposta-a-voce', 'citacao', 'mencao', 'resolveu'] as const) {
      expect(noticeTarget({ ...base, tipo: type, objeto: null }, 'lumi')).toEqual({ href: null, indisponivel: true })
    }
    expect(noticeTarget({ ...base, tipo: 'banido', comunidade: null }, 'lumi')).toEqual({ href: null, indisponivel: true })
    expect(noticeTarget({ ...base, tipo: 'amizade-aceita', origem: null }, 'lumi').indisponivel).toBe(true)
  })
  it('all protocol types have a defined destination (none throws)', () => {
    for (const type of NOTIFICATION_TYPES) expect(() => noticeTarget({ ...base, tipo: type }, 'lumi')).not.toThrow()
  })
  it('only friend request and invitation have an action right there, and only with the pointers', () => {
    expect(noticeAction({ ...base, tipo: 'pedido-de-amizade' })).toBe('amizade')
    expect(noticeAction({ ...base, tipo: 'pedido-de-amizade', origem: null })).toBeNull()
    expect(noticeAction({ ...base, tipo: 'convite-comunidade', comunidade: 'ob_c' })).toBe('convite')
    expect(noticeAction({ ...base, tipo: 'convite-comunidade', comunidade: null })).toBeNull()
    expect(noticeAction({ ...base, tipo: 'recado' })).toBeNull()
  })
  it('new is only what has a number greater than the last seen', () => {
    expect(isNewItem({ seq: 6 }, 5)).toBe(true)
    expect(isNewItem({ seq: 5 }, 5)).toBe(false)
  })
})

const page = (you: RoverPage['voce'], notes: 'todos' | 'amigos' | 'ninguem' = 'todos'): RoverPage =>
  ({ rover: { recados: notes } as never, selos: { confiavel: 0, caprichoso: 0, rapido: 0, divertido: 0 }, contagens: {} as never, voce: you })
const you = { amigo: true, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null }

describe('elegibilidade e podeDarSelo', () => {
  it('a 7-day friend with a 7-day account can give a badge and write a testimonial', () => {
    const e = eligibility(page(you), 7, 7)
    expect(e.selo.ok && e.depoimento.ok).toBe(true)
    expect(canGiveBadge(page(you), e, true)).toBe('sim')
  })
  it('a new friend: testimonial yes (3 days), badge no (new-account → "sem-tempo")', () => {
    const e = eligibility(page(you), 4, 30)
    expect(e.depoimento.ok).toBe(true)
    expect(canGiveBadge(page(you), e, true)).toBe('sem-tempo')
  })
  it('whoever is not a friend gets the reason "nao-amigo"; without an app, the page owner and a block never show the button', () => {
    expect(canGiveBadge(page({ ...you, amigo: false }), eligibility(page({ ...you, amigo: false }), 0, 30), true)).toBe('nao-amigo')
    expect(canGiveBadge(page(you), eligibility(page(you), 9, 9), false)).toBe('ninguem')
    expect(canGiveBadge(page({ ...you, papel: 'proprio' }), eligibility(page({ ...you, papel: 'proprio' }), 9, 9), true)).toBe('ninguem')
    expect(canGiveBadge(page({ ...you, euBloqueei: true }), eligibility(page({ ...you, euBloqueei: true }), 9, 9), true)).toBe('ninguem')
  })
  it('a note follows the wall rule: nobody, friends only and a block give the same refusal', () => {
    expect(eligibility(page({ ...you, amigo: false }, 'amigos'), 0, 30).recado).toEqual({ ok: false, motivo: 'interacao-nao-permitida' })
    expect(eligibility(page(you, 'ninguem'), 9, 30).recado).toEqual({ ok: false, motivo: 'interacao-nao-permitida' })
    expect(eligibility(page({ ...you, euBloqueei: true }, 'todos'), 9, 30).recado).toEqual({ ok: false, motivo: 'interacao-nao-permitida' })
    expect(eligibility(page(you, 'amigos'), 9, 30).recado.ok).toBe(true)
  })
})
