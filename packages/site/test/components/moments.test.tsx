// The Momentos page on the real relay (owner decision of 2026-11-26): the moments of the last 24 hours, read from
// GET /v1/postagens?ordem=novas, each one the card Rover Hangar drew (the post's attached image, served by the site's own /midia route)
// with the post text as caption. Several moments of the same rover show side by side. Nothing yet: the honest empty state; the relay
// down: the error state. 18+ stays out for whoever cannot see it. The demonstration keeps its scene and never asks the relay.
import { createHash } from 'node:crypto'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Page, Post } from '@/lib/types'

const h = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  adulto: false,
  paginas: [] as (Page<Post> | 'falha')[],
  modo: 'http' as 'http' | 'falso',
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: h.notFound, usePathname: () => '/pt/momentos', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/folgali/session', () => ({ currentPerson: async () => null }))
vi.mock('@/lib/folgali/vault', () => ({ linkedOf: () => [], consentOf: () => null, preferencesOf: () => ({ adulto: false, semTreino: false }) }))
vi.mock('@/lib/adult', async (original) => ({ ...(await original<typeof import('@/lib/adult')>()), canSeeAdult: async () => h.adulto }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import { FakeClient } from '@/lib/fake-client'
const fake = new FakeClient(() => new Date())
const relay = {
  modo: 'http' as const,
  postagensOrdenadas: vi.fn(async (o: { ordem?: string; limite?: number; cursor?: string }) => {
    const k = o.cursor ? Number(o.cursor) : 0
    const p = h.paginas[k]
    if (p === 'falha') throw new Error('o relé não respondeu')
    return p ?? { itens: [] }
  }),
}
vi.mock('@/lib/get-network', () => ({ getNetwork: () => (h.modo === 'http' ? { cliente: relay, ponte: { whoAmI: async () => null } } : { cliente: fake, ponte: fake }) }))

import Moments from '@/app/[lang]/momentos/page'
import { dict } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { demoId } from '@/lib/domain/ids'
import { faceByUid } from '@/lib/domain/expression'

const t = dict('pt').socFolgali.momentos
const real = legalDict('pt').real
const PIPA = demoId('rvr', 'pipa')
const NINA = demoId('rvr', 'nina')
const H = 3600 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const moment = (id: string, who: string, nome: string, texto: string, extra: Partial<Post> = {}): Post => ({
  id: demoId('ob', id), tipo: 'postagem', autor: { uid: who, handle: nome.toLowerCase(), nome, rosto: faceByUid(who) }, texto, topicos: ['momento'], criadaEm: ago(H),
  respostas: 0, reacoes: { curtir: 0, util: 0 }, imagens: [{ hash: hash(id), formato: 'jpeg', largura: 1080, altura: 1350, alt: texto }], ...extra,
})
const open = async (lang = 'pt') => render(await Moments({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({}) }))

afterEach(() => {
  h.adulto = false
  h.paginas = []
  h.modo = 'http'
  relay.postagensOrdenadas.mockClear()
  vi.restoreAllMocks()
})

describe('/momentos on the real relay', () => {
  it('shows each moment as its drawn card from /midia, named by the image alt, with the post text as caption; newest first', async () => {
    const older = moment('a1', PIPA, 'Pipa', 'Organizei as estrelas por cor.', { criadaEm: ago(5 * H) })
    const newer = moment('b1', NINA, 'Nina', 'Aprendi um nó de marinheiro.', { criadaEm: ago(H) })
    h.paginas = [{ itens: [newer, older] }]
    await open()
    expect(relay.postagensOrdenadas).toHaveBeenCalledWith({ ordem: 'novas', limite: 50, cursor: undefined })
    const card = screen.getByRole('img', { name: 'Aprendi um nó de marinheiro.' })
    expect(card).toHaveAttribute('src', `/midia/${hash('b1')}.jpg`)
    expect(card).toHaveAttribute('width', '1080')
    expect(card).toHaveAttribute('height', '1350')
    expect(card.closest('figure')).toHaveAttribute('data-cartao')
    // the card already says the text: no caption repeating it, the sentence stays in the image's accessible name
    expect(document.querySelector('.moment-caption')).toBeNull()
    // behind the card, the same card as a decorative backdrop: no name, hidden from assistive technology, inside the same frame
    const backdrop = document.querySelector('img.moment-card-backdrop')
    expect(backdrop).toHaveAttribute('src', `/midia/${hash('b1')}.jpg`)
    expect(backdrop).toHaveAttribute('alt', '')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop?.closest('figure')).toBe(card.closest('figure'))
    expect(screen.getAllByRole('img').filter((x) => x.getAttribute('src')?.startsWith('/midia/'))).toEqual([card])
    const list = within(screen.getByRole('navigation', { name: t.lista })).getAllByRole('button')
    expect(list.map((b) => b.querySelector('strong')?.textContent)).toEqual(['Nina', 'Pipa'])
  })
  it('several moments of the same rover: each one its own row and bar, without a React key clash', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.paginas = [{ itens: [moment('c1', PIPA, 'Pipa', 'Primeiro.', { criadaEm: ago(H) }), moment('d1', PIPA, 'Pipa', 'Segundo.', { criadaEm: ago(2 * H) }), moment('e1', PIPA, 'Pipa', 'Terceiro.', { criadaEm: ago(3 * H) })] }]
    await open()
    expect(within(screen.getByRole('navigation', { name: t.lista })).getAllByRole('button')).toHaveLength(3)
    expect(document.querySelectorAll('.moment-bars span')).toHaveLength(3)
    expect(errors.mock.calls.some((c) => /same key/.test(String(c[0])))).toBe(false)
  })
  it('the caption shows only when the post says something the card does not; spaces and line breaks do not count', async () => {
    h.paginas = [{ itens: [moment('p1', NINA, 'Nina', 'Fiz um chá\n e fiquei   olhando a chuva. ', { imagens: [{ hash: hash('p1'), formato: 'jpeg', largura: 1080, altura: 1350, alt: 'Fiz um chá e fiquei olhando a chuva.' }] })] }]
    await open()
    expect(document.querySelector('.moment-caption')).toBeNull()
    expect(screen.getByRole('img', { name: 'Fiz um chá e fiquei olhando a chuva.' })).toBeInTheDocument()
    document.body.innerHTML = ''
    h.paginas = [{ itens: [moment('q1', NINA, 'Nina', 'Chá de hortelã, e a chuva não parou.', { imagens: [{ hash: hash('q1'), formato: 'jpeg', largura: 1080, altura: 1350, alt: 'Fiz um chá e fiquei olhando a chuva.' }] })] }]
    await open()
    expect(document.querySelector('.moment-caption')).toHaveTextContent('Chá de hortelã, e a chuva não parou.')
  })
  it('an image with no description gets the generic name with the author, never an empty alt', async () => {
    h.paginas = [{ itens: [moment('f1', NINA, 'Nina', 'Sem descrição.', { imagens: [{ hash: hash('f1'), formato: 'jpeg', largura: 1080, altura: 1350, alt: '' }] })] }]
    await open()
    expect(screen.getByRole('img', { name: 'Imagem publicada por Nina' })).toHaveAttribute('src', `/midia/${hash('f1')}.jpg`)
  })
  it('ordinary posts, posts without a card, removed ones, 18+ for a reader who cannot see and the ones older than a day stay out', async () => {
    h.paginas = [{
      itens: [
        moment('g1', PIPA, 'Pipa', 'Post comum.', { topicos: [] }),
        moment('h1', PIPA, 'Pipa', 'Sem cartão.', { imagens: undefined }),
        moment('i1', PIPA, 'Pipa', 'Removido.', { removida: true }),
        moment('j1', NINA, 'Nina', 'Texto +18.', { adulto: true }),
        moment('k1', NINA, 'Nina', 'Fica.'),
        moment('l1', NINA, 'Nina', 'De anteontem.', { criadaEm: ago(30 * H) }),
      ],
      proximo: '1',
    }, { itens: [moment('m1', NINA, 'Nina', 'Nunca lido.')] }]
    await open()
    expect(screen.getAllByRole('img', { name: /./ }).filter((x) => x.classList.contains('moment-card-image')).map((x) => x.getAttribute('alt'))).toEqual(['Fica.'])
    // the page with a post older than 24 hours is the last one read
    expect(relay.postagensOrdenadas).toHaveBeenCalledTimes(1)
  })
  it('the 18+ moment shows for a reader who turned it on', async () => {
    h.adulto = true
    h.paginas = [{ itens: [moment('n1', NINA, 'Nina', 'Texto +18.', { adulto: true })] }]
    await open()
    expect(screen.getByRole('img', { name: 'Texto +18.' })).toBeInTheDocument()
  })
  it('no moment in the last day: the honest empty state with the way to the feed', async () => {
    h.paginas = [{ itens: [moment('o1', PIPA, 'Pipa', 'Post comum.', { topicos: [] })] }]
    await open()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t.titulo)
    expect(screen.getByText(real.momentosTexto)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: dict('pt').socFolgali.feed.titulo })).toHaveAttribute('href', '/pt/linha')
  })
  it('the relay down: the error state, not an empty list that pretends nobody posted', async () => {
    h.paginas = ['falha']
    await open()
    expect(screen.queryByText(real.momentosTexto)).toBeNull()
    expect(screen.getByText(dict('pt').socComum.erros['fora-do-ar'].titulo)).toBeInTheDocument()
  })
  it('the demonstration keeps its scene (house photos) and never asks the relay', async () => {
    h.modo = 'falso'
    await open()
    expect(relay.postagensOrdenadas).not.toHaveBeenCalled()
    expect(document.querySelector('.moment-frame')).not.toHaveAttribute('data-cartao')
    expect(document.querySelector('.moment-photo')?.getAttribute('src')).toMatch(/^\/marca\/folgali\//)
    // the demonstration keeps its caption on every moment and has no card backdrop
    expect(document.querySelector('.moment-caption')?.textContent).not.toBe('')
    expect(document.querySelector('.moment-card-backdrop')).toBeNull()
  })
})
