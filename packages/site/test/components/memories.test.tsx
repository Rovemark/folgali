// The Lembranças page on the real relay (addition of 2026-11-26): signed out, the honest empty state with the way to sign in; signed in,
// the memories of HER rovers (the ones Rover Hangar sent through Rovemark, `linkedOf`), grouped by window in the agreed order, with the
// rover's portrait, the text, who and when, and the link to the original; an empty state when the rovers have no history yet or the relay
// does not announce `lembrancas`. 18+ items stay out for whoever cannot see them. The demonstration keeps its scripted scene.
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Linked } from '@/lib/folgali/vault'
import type { RoverMemories, MemoryWindow } from '@/lib/memories'
import type { Post } from '@/lib/types'

const h = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  pessoa: null as null | { id: string; nome: string },
  ligados: [] as Linked[],
  adulto: false,
  recursos: ['lembrancas'] as string[],
  lembrancas: {} as Record<string, RoverMemories | null | 'falha'>,
  modo: 'http' as 'http' | 'falso',
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: h.notFound, usePathname: () => '/pt/lembrancas', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/folgali/session', () => ({ currentPerson: async () => h.pessoa }))
vi.mock('@/lib/folgali/vault', () => ({ linkedOf: () => h.ligados, consentOf: () => null, preferencesOf: () => ({ adulto: false, semTreino: false }) }))
vi.mock('@/lib/adult', async (original) => ({ ...(await original<typeof import('@/lib/adult')>()), canSeeAdult: async () => h.adulto }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import { FakeClient } from '@/lib/fake-client'
const fake = new FakeClient(() => new Date('2026-11-26T15:00:00.000Z'))
const relay = {
  modo: 'http' as const,
  suporta: vi.fn(async (r: string) => h.recursos.includes(r)),
  lembrancas: vi.fn(async (uid: string) => {
    const r = h.lembrancas[uid]
    if (r === 'falha') throw new Error('o relé não respondeu')
    return r ?? null
  }),
}
vi.mock('@/lib/get-network', () => ({ getNetwork: () => (h.modo === 'http' ? { cliente: relay, ponte: { whoAmI: async () => null } } : { cliente: fake, ponte: fake }) }))

import Memories from '@/app/[lang]/lembrancas/page'
import { dict } from '@/lib/i18n'
import { demoId } from '@/lib/domain/ids'
import { faceByUid } from '@/lib/domain/expression'
import { MEMORY_WINDOWS } from '@/lib/memories'

const t = dict('pt').socFolgali.lembrancas
const PIPA = demoId('rvr', 'pipa')
const NINA = demoId('rvr', 'nina')
const rover = (id: string, nome: string, handle: string): Linked => ({ id, tipo: 'rover', nome, handle, origem: 'Rover Hangar', ligadoEm: '2026-11-25T00:00:00.000Z' })
const post = (id: string, who: string, handle: string, nome: string, texto: string, extra: Partial<Post> = {}): Post => ({
  id: demoId('ob', id), tipo: 'postagem', autor: { uid: who, handle, nome, rosto: faceByUid(who) }, texto, topicos: [], criadaEm: '2026-11-25T09:00:00.000Z', respostas: 0, reacoes: { curtir: 0, util: 0 }, ...extra,
})
const memories = (uid: string, w: Partial<Record<MemoryWindow, Post[]>>): RoverMemories => ({ rover: uid, janelas: MEMORY_WINDOWS.map((janela) => ({ janela, itens: w[janela] ?? [] })) })
const open = async (lang = 'pt') => render(await Memories({ params: Promise.resolve({ lang }) }))

afterEach(() => {
  h.pessoa = null
  h.ligados = []
  h.adulto = false
  h.recursos = ['lembrancas']
  h.lembrancas = {}
  h.modo = 'http'
  relay.lembrancas.mockClear()
  relay.suporta.mockClear()
})

describe('/lembrancas on the real relay', () => {
  it('signed out: the screen name, the honest empty text and the way to sign in; the relay is not asked', async () => {
    await open()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lembranças')
    expect(screen.getByText(t.semLogin)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t.entrar })).toHaveAttribute('href', '/pt/entrar')
    expect(relay.lembrancas).not.toHaveBeenCalled()
  })
  it('signed in without a rover of hers (an outside agent is not a rover): the empty text says how a rover gets here', async () => {
    h.pessoa = { id: 'p_ana1234567', nome: 'Ana' }
    h.ligados = [{ id: demoId('rvr', 'agente'), tipo: 'agente', nome: 'Agente', ligadoEm: '2026-11-25T00:00:00.000Z' }]
    await open()
    expect(screen.getByText(t.semRovers)).toBeInTheDocument()
    expect(relay.lembrancas).not.toHaveBeenCalled()
  })
  it('her rovers with no history yet, or a relay that does not announce `lembrancas`: the empty state, honest', async () => {
    h.pessoa = { id: 'p_ana1234567', nome: 'Ana' }
    h.ligados = [rover(PIPA, 'Pipa', 'pipa'), rover(NINA, 'Nina', 'nina')]
    h.lembrancas = { [PIPA]: memories(PIPA, {}), [NINA]: null }
    await open()
    expect(screen.getByText(t.vazio)).toBeInTheDocument()
    expect(relay.lembrancas.mock.calls.map((c) => c[0])).toEqual([PIPA, NINA])
    document.body.innerHTML = ''
    relay.lembrancas.mockClear()
    h.recursos = []
    h.lembrancas = { [PIPA]: memories(PIPA, { ontem: [post('x', PIPA, 'pipa', 'Pipa', 'Não deveria aparecer.')] }) }
    await open()
    expect(screen.getByText(t.vazio)).toBeInTheDocument()
    expect(relay.lembrancas).not.toHaveBeenCalled()
  })
  it('with history: one group per window in order, each memory with the portrait, the text, who, when and the link to the original', async () => {
    h.pessoa = { id: 'p_ana1234567', nome: 'Ana' }
    h.ligados = [rover(PIPA, 'Pipa', 'pipa'), rover(NINA, 'Nina', 'nina'), rover(demoId('rvr', 'falha'), 'Falha', 'falha')]
    const yesterday = post('ontem', PIPA, 'pipa', 'Pipa', 'Fiquei lendo a previsão do tempo.')
    const reply = post('resp', NINA, 'nina', 'Nina', 'Respondi a Pipa sobre a chuva.', { tipo: 'resposta', respondeA: demoId('ob', 'pai') })
    const first = post('prim', PIPA, 'pipa', 'Pipa', 'Cheguei na rede hoje.', { titulo: 'Primeiro dia' })
    const week = post('sem', NINA, 'nina', 'Nina', 'Uma semana de folga.')
    const adult = post('adulto', NINA, 'nina', 'Nina', 'Texto +18.', { adulto: true })
    h.lembrancas = {
      [PIPA]: memories(PIPA, { ontem: [yesterday], 'primeiro-dia': [first] }),
      [NINA]: memories(NINA, { ontem: [reply, adult], 'uma-semana': [week] }),
      [demoId('rvr', 'falha')]: 'falha',
    }
    await open()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lembranças')
    expect(screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)).toEqual(['Ontem', 'Há uma semana', 'No primeiro dia'])
    const ontem = screen.getByRole('region', { name: 'Ontem' })
    const items = within(ontem).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Fiquei lendo a previsão do tempo.')).toBeInTheDocument()
    expect(within(items[0]).getByRole('link', { name: 'Pipa' })).toHaveAttribute('href', '/pt/r/pipa')
    expect(within(items[0]).getByRole('link', { name: t.verOriginal })).toHaveAttribute('href', `/pt/p/${yesterday.id}`)
    expect(items[0].querySelector('time')).toHaveAttribute('dateTime', yesterday.criadaEm)
    expect(items[0].querySelector('.portrait')).not.toBeNull()
    expect(within(items[1]).getByText(new RegExp(t.resposta))).toBeInTheDocument()
    expect(within(items[1]).getByRole('link', { name: t.verOriginal })).toHaveAttribute('href', `/pt/p/${reply.id}`)
    // 18+ stays out for whoever did not turn it on
    expect(screen.queryByText('Texto +18.')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'No primeiro dia' })).getByText('Primeiro dia. Cheguei na rede hoje.')).toBeInTheDocument()
  })
  it('one rover: the title carries its name; another language: the window names of that language', async () => {
    h.pessoa = { id: 'p_ana1234567', nome: 'Ana' }
    h.ligados = [rover(PIPA, 'Pipa', 'pipa')]
    h.lembrancas = { [PIPA]: memories(PIPA, { ontem: [post('ontem', PIPA, 'pipa', 'Pipa', 'Oi.')], 'primeiro-dia': [post('prim', PIPA, 'pipa', 'Pipa', 'Primeiro.')] }) }
    await open()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Lembranças d[aoe] Pipa$/)
    document.body.innerHTML = ''
    await open('en')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Pipa's memories")
    expect(screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)).toEqual(['Yesterday', 'On the first day'])
    expect(screen.getAllByRole('link', { name: 'See the original' })).toHaveLength(2)
  })
  it('the demonstration keeps its scripted scene and never asks the relay', async () => {
    h.modo = 'falso'
    await open()
    expect(screen.getByRole('heading', { name: t.nesteDia })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.compartilhar })).toBeInTheDocument()
    expect(relay.lembrancas).not.toHaveBeenCalled()
  })
})
