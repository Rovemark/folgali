// 0.8.0 (proposal 0010): the five reactions of a post are stored for real. A signed-in person signs with the device key; otherwise the
// server action answers (demo stores, real relay without a paired app refuses and the reaction goes back with a sign-in notice).
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  reactAction: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: true })),
  personState: vi.fn(async (): Promise<{ consent: boolean; profile: boolean }> => { throw new Error('not ready') }),
  publish: vi.fn(async (type: string, body?: unknown): Promise<{ id: string }> => ({ id: `ob_${type}_${body ? '' : 'x'}${Math.random().toString(36).slice(2)}` })),
  myReactions: vi.fn(async (...args: [{ id: string; parent?: string }[]]): Promise<Record<string, string | null>> => (args.length ? {} : {})),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/pt/linha', useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/actions', () => ({ reactAction: h.reactAction }))
vi.mock('@/lib/person/client', () => {
  class PersonError extends Error {
    constructor(public readonly status: number, public readonly code: string) { super(code) }
  }
  return { PersonError, personState: h.personState, publish: h.publish, myReactions: h.myReactions }
})

import { PersonError } from '@/lib/person/client'
import { NOTICE_EVENT, type NoticeDetail } from '@/components/life/notice'
import PostReactions, { writeAsPerson } from '@/components/life/PostReactions'
import { sanitizePost } from '@/lib/sanitize'
import { FakeClient } from '@/lib/fake-client'
import { ALL_REACTIONS, POST_ONLY_REACTIONS, POST_REACTIONS } from '@/lib/types'

const POST = `ob_${'A'.repeat(43)}`
const notices: string[] = []
if (typeof window !== 'undefined') window.addEventListener(NOTICE_EVENT, (e) => notices.push((e as CustomEvent<NoticeDetail>).detail.texto))

beforeEach(() => {
  vi.clearAllMocks()
  notices.length = 0
})

describe('the vocabulary on the site', () => {
  it('five post reactions, util kept for the forum', () => {
    expect([...POST_REACTIONS]).toEqual(['curtir', 'amei', 'haha', 'uau', 'abraco'])
    expect([...POST_ONLY_REACTIONS]).toEqual(['amei', 'haha', 'uau', 'abraco'])
    expect([...ALL_REACTIONS]).toEqual(['curtir', 'util', 'amei', 'haha', 'uau', 'abraco'])
  })
  it('sanitizePost keeps the new counts only when positive, and any of the six as minhaReacao', () => {
    const base = { id: POST, tipo: 'postagem', autor: { uid: `rvr_${'B'.repeat(22)}`, handle: 'pipa', nome: 'Pipa' }, texto: 'oi', criadaEm: new Date(0).toISOString() }
    const p = sanitizePost({ ...base, reacoes: { curtir: 2, util: 0, amei: 3, haha: 0, uau: -1, abraco: 'x', grr: 9 }, minhaReacao: 'amei' })
    expect(p.reacoes).toEqual({ curtir: 2, util: 0, amei: 3 })
    expect(p.minhaReacao).toBe('amei')
    expect(sanitizePost({ ...base, reacoes: {}, minhaReacao: 'grr' }).minhaReacao).toBeUndefined()
    expect(sanitizePost({ ...base, reacoes: { abraco: 1 } }).reacoes).toEqual({ curtir: 0, util: 0, abraco: 1 })
  })
})

describe('PostReactions on screen', () => {
  it('shows the counts by type with their names for the screen reader', () => {
    render(<PostReactions id={POST} counts={{ curtir: 2, util: 5, amei: 1 }} mine={null} label="Curtir" />)
    const tally = screen.getByRole('img', { name: 'Reações: Curtir 2, Amei 1' })
    expect(tally).toHaveTextContent('21')
    expect(screen.getByRole('button', { name: 'Curtir' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('no reaction yet: no tally at all', () => {
    render(<PostReactions id={POST} counts={{ curtir: 0, util: 0 }} mine={null} label="Curtir" />)
    expect(screen.queryByRole('img', { name: /Reações/ })).toBeNull()
  })
  it('the reaction the relay says is mine is pressed and not counted twice', () => {
    render(<PostReactions id={POST} counts={{ curtir: 0, util: 0, haha: 1 }} mine="haha" label="Curtir" />)
    expect(screen.getByRole('button', { name: 'Haha' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Reações: Haha 1' })).toBeInTheDocument()
  })
  it('without a person, the tap goes to the server action (the demo), and the count follows', async () => {
    render(<PostReactions id={POST} counts={{ curtir: 1, util: 0 }} mine={null} label="Curtir" />)
    await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
    await waitFor(() => expect(h.reactAction).toHaveBeenCalledWith(POST, 'curtir'))
    expect(screen.getByRole('img', { name: 'Reações: Curtir 2' })).toBeInTheDocument()
    expect(h.publish).not.toHaveBeenCalled()
    // tapping again takes it back: the action receives the reaction being removed (it toggles)
    await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
    await waitFor(() => expect(h.reactAction).toHaveBeenLastCalledWith(POST, 'curtir'))
    expect(screen.getByRole('img', { name: 'Reações: Curtir 1' })).toBeInTheDocument()
  })
  it('the real relay without a paired app refuses: the reaction goes back and the person is told to sign in', async () => {
    h.reactAction.mockResolvedValueOnce({ ok: false })
    render(<PostReactions id={POST} counts={{ curtir: 1, util: 0 }} mine={null} label="Curtir" />)
    await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
    await waitFor(() => expect(notices).toContain('Entre com a sua conta e crie o seu perfil para reagir.'))
    expect(screen.getByRole('button', { name: 'Curtir' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('img', { name: 'Reações: Curtir 1' })).toBeInTheDocument()
  })
})

describe('after a reload: the person\'s own reaction comes back from the relay', () => {
  const REPLY = `ob_${'R'.repeat(43)}`
  it('the posts on screen ask together, once, and the button shows her reaction without counting it twice', async () => {
    h.myReactions.mockResolvedValueOnce({ [POST]: 'amei', [REPLY]: 'haha' })
    render(
      <>
        <PostReactions id={POST} counts={{ curtir: 1, util: 0, amei: 1 }} mine={null} label="Curtir" />
        <PostReactions id={REPLY} counts={{ curtir: 0, util: 0, haha: 1 }} mine={null} label="Curtir" parent={POST} />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Amei' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('button', { name: 'Haha' })).toHaveAttribute('aria-pressed', 'true')
    expect(h.myReactions).toHaveBeenCalledTimes(1)
    expect(h.myReactions).toHaveBeenCalledWith([{ id: POST, parent: undefined }, { id: REPLY, parent: POST }])
    expect(screen.getByRole('img', { name: 'Reações: Curtir 1, Amei 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Reações: Haha 1' })).toBeInTheDocument()
  })
  it('switching after the reload counts right: the old one leaves the tally, the new one enters', async () => {
    h.myReactions.mockResolvedValueOnce({ [POST]: 'amei' })
    h.personState.mockResolvedValue({ consent: true, profile: true })
    vi.resetModules()
    const { default: Fresh } = await import('@/components/life/PostReactions')
    render(<Fresh id={POST} counts={{ curtir: 0, util: 0, amei: 2 }} mine={null} label="Curtir" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Amei' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('img', { name: 'Reações: Amei 2' })).toBeInTheDocument()
    await userEvent.hover(screen.getByRole('button', { name: 'Amei' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Uau' }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('reacao', { alvo: POST, reacao: 'uau' }))
    expect(screen.getByRole('img', { name: 'Reações: Amei 1, Uau 1' })).toBeInTheDocument()
  })
  it('nothing comes back (visitor, demo, another device): the button stays as the page drew it', async () => {
    render(<PostReactions id={POST} counts={{ curtir: 2, util: 0 }} mine={null} label="Curtir" />)
    await waitFor(() => expect(h.myReactions).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Curtir' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('img', { name: 'Reações: Curtir 2' })).toBeInTheDocument()
  })
  it('the page already knows (demo) or the person tapped first: nothing is asked or the answer is ignored', async () => {
    render(<PostReactions id={POST} counts={{ curtir: 0, util: 0, uau: 1 }} mine="uau" label="Curtir" />)
    await new Promise((r) => setTimeout(r, 5))
    expect(h.myReactions).not.toHaveBeenCalled()
  })
})

describe('writing as a person (device key)', () => {
  it('a reaction, a switch, and taking it back by the id it got', async () => {
    const T = `ob_${'C'.repeat(43)}`
    expect(await writeAsPerson(T, 'amei', null)).toBe(false)
    expect(h.publish).toHaveBeenLastCalledWith('reacao', { alvo: T, reacao: 'amei' })
    const second = await h.publish.mock.results.at(-1)!.value
    await writeAsPerson(T, 'uau', 'amei')
    expect(h.publish).toHaveBeenLastCalledWith('reacao', { alvo: T, reacao: 'uau' })
    const uau = (await h.publish.mock.results.at(-1)!.value).id
    expect(uau).not.toBe(second.id)
    await writeAsPerson(T, null, 'uau')
    expect(h.publish).toHaveBeenLastCalledWith('remocao-pelo-autor', { alvo: uau })
    expect(h.publish).toHaveBeenCalledTimes(3)
  })
  it('taking back without a known id: a replacement reaction, then its removal', async () => {
    const T = `ob_${'D'.repeat(43)}`
    await writeAsPerson(T, null, 'curtir')
    expect(h.publish.mock.calls.map((c) => c[0])).toEqual(['reacao', 'remocao-pelo-autor'])
    expect(h.publish.mock.calls[0][1]).toEqual({ alvo: T, reacao: 'amei' })
    const replacement = (await h.publish.mock.results[0].value).id
    expect(h.publish.mock.calls[1][1]).toEqual({ alvo: replacement })
  })
  it('ja_reagiu means the relay already has it; other errors go up', async () => {
    const T = `ob_${'E'.repeat(43)}`
    h.publish.mockRejectedValueOnce(new PersonError(409, 'ja_reagiu'))
    expect(await writeAsPerson(T, 'haha', null)).toBe(true)
    h.publish.mockRejectedValueOnce(new PersonError(429, 'limite_de_taxa'))
    await expect(writeAsPerson(T, 'uau', 'haha')).rejects.toThrow('limite_de_taxa')
  })
  it('a signed-in person with a profile writes through the device, not the server action', async () => {
    h.personState.mockResolvedValue({ consent: true, profile: true })
    vi.resetModules()
    const { default: Fresh } = await import('@/components/life/PostReactions')
    render(<Fresh id={POST} counts={{ curtir: 0, util: 0 }} mine={null} label="Curtir" />)
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: 'Curtir' })) })
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('reacao', { alvo: POST, reacao: 'curtir' }))
    expect(h.reactAction).not.toHaveBeenCalled()
  })
})

describe('the edges that matter', () => {
  const fresh = async () => {
    vi.resetModules()
    return (await import('@/components/life/PostReactions')).default
  }
  it('a person without a profile, or without consent, goes to the server action (and is told to sign in when it refuses)', async () => {
    for (const state of [{ consent: true, profile: false }, { consent: false, profile: true }]) {
      vi.clearAllMocks()
      h.personState.mockResolvedValue(state)
      h.reactAction.mockResolvedValueOnce({ ok: false })
      const Fresh = await fresh()
      const { unmount } = render(<Fresh id={POST} counts={{ curtir: 0, util: 0 }} mine={null} label="Curtir" />)
      await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
      await waitFor(() => expect(h.reactAction).toHaveBeenCalledWith(POST, 'curtir'))
      expect(h.publish).not.toHaveBeenCalled()
      unmount()
    }
  })
  it('the relay already had it (ja_reagiu): the reaction stays and is not counted twice', async () => {
    h.personState.mockResolvedValue({ consent: true, profile: true })
    h.publish.mockRejectedValueOnce(new PersonError(409, 'ja_reagiu'))
    const Fresh = await fresh()
    render(<Fresh id={POST} counts={{ curtir: 1, util: 0 }} mine={null} label="Curtir" />)
    await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('img', { name: 'Reações: Curtir 1' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Curtir' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('a second tap while the first is still on its way is ignored', async () => {
    let release: (v: { ok: boolean }) => void = () => {}
    h.reactAction.mockImplementationOnce(() => new Promise((ok) => { release = ok }))
    h.personState.mockRejectedValue(new Error('no person'))
    const Fresh = await fresh()
    render(<Fresh id={POST} counts={{ curtir: 0, util: 0 }} mine={null} label="Curtir" />)
    await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
    await waitFor(() => expect(h.reactAction).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
    expect(h.reactAction).toHaveBeenCalledTimes(1)
    await act(async () => { release({ ok: true }) })
    await userEvent.click(screen.getByRole('button', { name: 'Curtir' }))
    await waitFor(() => expect(h.reactAction).toHaveBeenCalledTimes(2))
  })
  it('new counts from the server replace the old ones on screen', () => {
    const { rerender } = render(<PostReactions id={POST} counts={{ curtir: 1, util: 0 }} mine={null} label="Curtir" />)
    expect(screen.getByRole('img', { name: 'Reações: Curtir 1' })).toBeInTheDocument()
    rerender(<PostReactions id={POST} counts={{ curtir: 1, util: 0, uau: 2 }} mine={null} label="Curtir" />)
    expect(screen.getByRole('img', { name: 'Reações: Curtir 1, Uau 2' })).toBeInTheDocument()
  })
  it('minhaReacao that is not a post reaction (util, or garbage) is not shown as mine', () => {
    for (const mine of ['util', 'grr', '']) {
      const { unmount } = render(<PostReactions id={POST} counts={{ curtir: 0, util: 1 }} mine={mine} label="Curtir" />)
      expect(screen.getByRole('button', { name: 'Curtir' })).toHaveAttribute('aria-pressed', 'false')
      unmount()
    }
  })
  it('taking back twice: the second time the id is gone, so it goes by replacement; and the replacement is not the one being removed', async () => {
    const T = `ob_${'F'.repeat(43)}`
    await writeAsPerson(T, 'curtir', null)
    expect(await writeAsPerson(T, null, 'curtir')).toBe(false)
    expect(h.publish.mock.calls.map((c) => c[0])).toEqual(['reacao', 'remocao-pelo-autor'])
    h.publish.mockClear()
    await writeAsPerson(T, null, 'amei')
    expect(h.publish.mock.calls[0]).toEqual(['reacao', { alvo: T, reacao: 'curtir' }])
    expect(h.publish.mock.calls[1][0]).toBe('remocao-pelo-autor')
  })
})

describe('the demo client takes the five', () => {
  it('react, switch (the count moves), the same again takes it back', async () => {
    const c = new FakeClient()
    const post = (await c.homeTimeline()).itens.find((p) => !p.removida)!
    const before = { ...post.reacoes }
    await c.reagir(post.id, 'amei')
    let now = (await c.getObject(post.id)).postagem.reacoes
    expect(now.amei ?? 0).toBe((before.amei ?? 0) + 1)
    await c.reagir(post.id, 'abraco')
    now = (await c.getObject(post.id)).postagem.reacoes
    expect([now.amei ?? 0, now.abraco ?? 0]).toEqual([before.amei ?? 0, (before.abraco ?? 0) + 1])
    await c.reagir(post.id, 'abraco')
    now = (await c.getObject(post.id)).postagem.reacoes
    expect(now.abraco ?? 0).toBe(before.abraco ?? 0)
  })
})
