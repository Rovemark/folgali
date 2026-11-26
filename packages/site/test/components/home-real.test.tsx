// The home page with the real relay: the most recent public posts replace the demo plush posts; the demo examples (with their
// "demo example" label) only come back while the relay has fewer than three public posts. The demo itself does not change.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/showcase/motion', () => ({ useReducedMotion: () => true, useInView: () => true }))

import LiveBoard from '@/components/showcase/LiveBoard'
import { liveActivity, livePosts } from '@/components/showcase/live-data'
import { MIN_REAL_POSTS, arrivalsFrom, heroFromPosts, liveFromPosts, showcasePosts, totalReactions } from '@/components/showcase/real-feed'
import { showcase } from '@/i18n/showcase'
import { faceByUid } from '@/lib/domain/expression'
import type { RoverProfile, Post } from '@/lib/types'

const uid = (n: number) => `rvr_${String(n).padStart(22, 'A')}`
const post = (n: number, extra: Partial<Post> = {}): Post => ({
  id: `ob_${String(n).padStart(43, 'P')}`,
  tipo: 'postagem',
  autor: { uid: uid(n), handle: `rover.${n}`, nome: `Rover ${n}`, rosto: faceByUid(uid(n)) },
  texto: `Texto real ${n}`,
  topicos: [],
  criadaEm: new Date(Date.UTC(2026, 10, 25, 12, 0, 0) - n * 3600_000).toISOString(),
  respostas: n,
  reacoes: { curtir: n, util: 0, amei: 1 },
  ...extra,
})
const when = (iso: string) => `há ${new Date(iso).getUTCHours()} h`

describe('which posts may go on the home page', () => {
  it('only live posts with text, never replies and never +18', () => {
    const list = [
      post(1),
      post(2, { tipo: 'resposta' }),
      post(3, { removida: true }),
      post(4, { adulto: true }),
      post(5, { adultHidden: true }),
      post(6, { texto: '   ' }),
      post(7),
    ]
    expect(showcasePosts(list).map((p) => p.id)).toEqual([post(1).id, post(7).id])
    expect(MIN_REAL_POSTS).toBe(3)
  })
  it('the reaction total adds every type the relay sent', () => {
    expect(totalReactions(post(4))).toBe(5)
    expect(totalReactions(post(0, { reacoes: { curtir: 0, util: 2, haha: 3, uau: 1, abraco: 1 } }))).toBe(7)
  })
})

describe('mapping real posts', () => {
  it('the hero ticker: up to six, newest first as given, real name, handle, time and reaction total, no photo', () => {
    const items = heroFromPosts([1, 2, 3, 4, 5, 6, 7].map((n) => post(n)), when)
    expect(items).toHaveLength(6)
    expect(items[0]).toEqual({ author: 'rover.1', name: 'Rover 1', text: 'Texto real 1', time: 'há 11 h', ficha: post(1).autor.rosto, photo: null, reactions: 2 })
  })
  it('folgali live: three posts, real reply count, up to three real replies without the removed or +18 ones', () => {
    const replies = new Map([[post(1).id, [post(11, { tipo: 'resposta' }), post(12, { tipo: 'resposta', removida: true }), post(13, { tipo: 'resposta', adulto: true }), post(14, { tipo: 'resposta' }), post(15, { tipo: 'resposta' }), post(16, { tipo: 'resposta' })]]])
    const live = liveFromPosts([1, 2, 3, 4].map((n) => post(n)), replies, when)
    expect(live).toHaveLength(3)
    expect(live[0]).toMatchObject({ author: 'rover.1', name: 'Rover 1', base: 2, note: 'há 11 h', total: 1, photo: null })
    expect(live[0].comments.map((c) => c.text)).toEqual(['Texto real 11', 'Texto real 14', 'Texto real 15'])
    expect(live[1].comments).toEqual([])
  })
  it('who just arrived: the relay newcomers with the line of the page language', () => {
    const r = { uid: uid(9), handle: 'nova', nome: 'Nova', rosto: faceByUid(uid(9)) } as RoverProfile
    expect(arrivalsFrom([r], 'chegou à folgali')).toEqual([{ author: 'nova', name: 'Nova', ficha: r.rosto, text: 'chegou à folgali' }])
    expect(arrivalsFrom(Array.from({ length: 12 }, () => r), 'x')).toHaveLength(8)
  })
})

describe('the live board', () => {
  const t = showcase('pt').live
  it('with real posts: no "demo example" label, the real counts, every real reply at once and who arrived', () => {
    const posts = liveFromPosts([1, 2, 3].map((n) => post(n)), new Map([[post(1).id, [post(21, { tipo: 'resposta' })]]]), when)
    render(<LiveBoard t={t} posts={posts} activity={arrivalsFrom([{ uid: uid(9), handle: 'nova', nome: 'Nova', rosto: faceByUid(uid(9)) } as RoverProfile], t.arrived)} real />)
    expect(screen.queryByText(new RegExp(t.note))).toBeNull()
    const first = screen.getAllByRole('article')[0]
    expect(within(first).getByText('Texto real 1')).toBeInTheDocument()
    expect(within(first).getByText(/há 11 h/)).toBeInTheDocument()
    expect(within(first).getByText('2')).toBeInTheDocument()
    expect(within(first).getByText(`1 ${t.comments}`)).toBeInTheDocument()
    expect(within(first).getByText('Texto real 21')).toBeInTheDocument()
    expect(screen.getByText(t.arrivedTitle)).toBeInTheDocument()
    expect(screen.getByText(t.arrived)).toBeInTheDocument()
    expect(screen.queryByText(t.activityTitle)).toBeNull()
  })
  it('with real posts and nobody arriving: the side column is not drawn (no repeated rovers)', () => {
    const posts = liveFromPosts([1, 2, 3].map((n) => post(n)), new Map(), when)
    const { container } = render(<LiveBoard t={t} posts={posts} activity={[]} real />)
    expect(container.querySelector('.sc-live-activity')).toBeNull()
  })
  it('the demo board is unchanged: the example label and the made-up activity', () => {
    render(<LiveBoard t={t} posts={livePosts(t)} activity={liveActivity(t)} />)
    expect(screen.getAllByText(new RegExp(t.note)).length).toBeGreaterThan(0)
    expect(screen.getByText(t.activityTitle)).toBeInTheDocument()
  })
})

describe('the home page wiring', () => {
  it('uses the real feed only outside the demo and only with at least MIN_REAL_POSTS posts', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const page = readFileSync(join(__dirname, '../../src/app/[lang]/page.tsx'), 'utf8')
    expect(page).toMatch(/isDemo\(client\.modo\) \? \[\] :/)
    expect(page).toMatch(/recent\.length >= MIN_REAL_POSTS/)
    expect(page).toMatch(/feedLabel: s\.hero\.feedLabelReal/)
  })
})
