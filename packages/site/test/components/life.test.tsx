// folgali's micro-interactions (src/components/life): what changes state has to change right, with keyboard and screen reader, and
// with no motion at all when the person asks for "reduce motion". The animations themselves are checked in the proof's photos and recordings.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  pathname: { valor: '/pt/linha' },
  refresh: vi.fn(),
  topo: vi.fn(async (): Promise<string | null> => null),
  followAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname.valor, useRouter: () => ({ refresh: h.refresh, push: vi.fn() }) }))
vi.mock('@/app/life-actions', () => ({ timelineTopAction: h.topo }))
vi.mock('@/app/actions', () => ({ followAction: h.followAction }))

import FollowButton from '@/components/FollowButton'
import EmptyState from '@/components/EmptyState'
import { NOTICE_EVENT, notify, announce } from '@/components/life/notice'
import LiveRing, { wasSeen, markSeen } from '@/components/life/LiveRing'
import Typing from '@/components/life/Typing'
import PostSkeleton from '@/components/life/PostSkeleton'
import Indicator from '@/components/life/Indicator'
import { runAnimation, noMotion, switchWithCircle } from '@/components/life/movement'
import NewPosts from '@/components/life/NewPosts'
import RollingNumber from '@/components/life/RollingNumber'
import LivePost, { LiveCount } from '@/components/life/LivePost'
import React from '@/components/life/ReactButton'
import { REACTIONS, LIFE_TEXTS, lifeTexts } from '@/components/life/texts'
import GlobalLife from '@/components/life/GlobalLife'
import { LOCALES } from '@/lib/i18n-base'

const root = join(__dirname, '../..')
const likes = { um: '1 curtida', outros: '{n} curtidas' }

beforeEach(() => {
  vi.clearAllMocks()
  h.pathname.valor = '/pt/linha'
})
afterEach(() => vi.useRealTimers())

describe('life texts in the 12 languages', () => {
  it('every language has the same keys, nothing empty, no em dash and with the {nome} and the {r} where needed', () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((x) => `${k}.${x}`) : [k])).sort()
    const pt = keys(LIFE_TEXTS.pt)
    for (const l of LOCALES) {
      expect(keys(LIFE_TEXTS[l]), l).toEqual(pt)
      const all = JSON.stringify(LIFE_TEXTS[l])
      expect(all, l).not.toMatch(/[—–]/)
      expect(all, l).not.toMatch(/""/)
      expect(LIFE_TEXTS[l].digitando, l).toContain('{nome}')
      expect(LIFE_TEXTS[l].reagiu, l).toContain('{r}')
    }
    expect(Object.keys(LIFE_TEXTS.pt.reacoes)).toEqual([...REACTIONS])
  })
  it('unknown language (or a name inherited from the object) falls back to Portuguese', () => {
    expect(lifeTexts('xx')).toBe(LIFE_TEXTS.pt)
    expect(lifeTexts('constructor')).toBe(LIFE_TEXTS.pt)
    expect(lifeTexts(undefined)).toBe(LIFE_TEXTS.pt)
    expect(lifeTexts('en').reacoes.abraco).toBe('Hug')
  })
})

describe('movimento: reduzir movimento manda', () => {
  it('without matchMedia or with "reduce motion", nothing animates and the theme switch happens at once', () => {
    expect(noMotion()).toBe(true)
    const el = document.createElement('div')
    el.animate = vi.fn() as unknown as typeof el.animate
    expect(runAnimation(el, [{ opacity: 0 }, { opacity: 1 }])).toBeNull()
    expect(el.animate).not.toHaveBeenCalled()
    const apply = vi.fn()
    switchWithCircle({ x: 1, y: 1 }, apply)
    expect(apply).toHaveBeenCalledTimes(1)
  })
  it('with motion allowed, it animates with the tokens\' spring and duration', () => {
    const mm = vi.fn(() => ({ matches: false }))
    vi.stubGlobal('matchMedia', mm)
    try {
      const el = document.createElement('div')
      const animate = vi.fn(() => ({}) as Animation)
      el.animate = animate as unknown as typeof el.animate
      runAnimation(el, [{ opacity: 0 }, { opacity: 1 }])
      expect(animate).toHaveBeenCalledTimes(1)
      expect((animate.mock.calls[0] as unknown[])[1]).toMatchObject({ duration: 200 })
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('no color-mix() in the life CSS mixes three colors (the browser refuses and the color vanishes; that is how the online green vanished)', () => {
    const css = readFileSync(join(root, 'src/app/folgali-life.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const mixes = [...css.matchAll(/color-mix\(in oklab,((?:[^()]|\([^()]*\))*)\)/g)].map((m) => m[1])
    expect(mixes.length).toBeGreaterThan(10)
    for (const m of mixes) expect(m.split(',').length, m).toBe(2)
    expect(css).toMatch(/--online: color-mix\(in oklab, var\(--menta\) 60%, var\(--grafite\)\);/)
  })
  it('the life CSS defines the spring family in one place and turns everything off with "reduce motion"', () => {
    const css = readFileSync(join(root, 'src/app/folgali-life.css'), 'utf8')
    for (const t of ['--vida-rapido: 120ms', '--vida-medio: 200ms', '--vida-lento: 320ms', '--vida-mola: linear(', '--vida-mola-suave: linear(']) expect(css).toContain(t)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css.match(/--vida-mola:/g)).toHaveLength(1)
    const base = readFileSync(join(root, 'src/app/folgali.css'), 'utf8')
    expect(base).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after \{ transition: none !important; animation: none !important/)
    expect(readFileSync(join(root, 'src/app/[lang]/layout.tsx'), 'utf8')).toContain("import '../folgali-life.css'")
  })
})

describe('React: like with five reactions', () => {
  it('tapping likes and removes; the count of the same post follows', async () => {
    render(
      <LivePost base={{ curtir: 10, amei: 4, haha: 1 }}>
        <LiveCount rotulo="Reações: {n}" curtidas={likes} />
        <React rotulo="Curtir" ajuda="só nesta tela" />
      </LivePost>,
    )
    expect(screen.getByRole('img', { name: 'Reações: 15' })).toHaveTextContent('15 curtidas')
    const button = screen.getByRole('button', { name: 'Curtir' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Reações: 16' })).toBeInTheDocument()
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('img', { name: 'Reações: 15' })).toBeInTheDocument()
  })
  it('↑ on the keyboard opens the five reactions; choosing "Amei" swaps the button, closes and returns the focus; Esc closes', async () => {
    render(
      <LivePost base={{ curtir: 1 }}>
        <LiveCount rotulo="Reações: {n}" curtidas={likes} />
        <React rotulo="Curtir" />
      </LivePost>,
    )
    const button = screen.getByRole('button', { name: 'Curtir' })
    button.focus()
    await userEvent.keyboard('{ArrowUp}')
    const group = screen.getByRole('group', { name: 'Escolher reação' })
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Curtir', 'Amei', 'Haha', 'Uau', 'Abraço'])
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(group).getByRole('button', { name: 'Amei' }))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Amei' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Amei' }))
    expect(screen.getByRole('img', { name: 'Reações: 2' })).toBeInTheDocument()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('group')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
  it('holding the finger opens the picker without liking; the screen reader hears the chosen reaction', async () => {
    vi.useFakeTimers()
    const ears: string[] = []
    const listen = (e: Event) => ears.push((e as CustomEvent).detail.texto)
    window.addEventListener(NOTICE_EVENT, listen)
    render(<React rotulo="Curtir" />)
    const button = screen.getByRole('button', { name: 'Curtir' })
    fireEvent.pointerDown(button, { pointerType: 'touch' })
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.pointerUp(button, { pointerType: 'touch' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(screen.getByRole('group')).getByRole('button', { name: 'Abraço' }))
    expect(screen.getByRole('button', { name: 'Abraço' })).toHaveAttribute('aria-pressed', 'true')
    expect(ears).toContain('Você reagiu com Abraço')
    window.removeEventListener(NOTICE_EVENT, listen)
  })
  it('on the English page, the reactions speak English', async () => {
    h.pathname.valor = '/en/linha'
    render(<React rotulo="Like" />)
    screen.getByRole('button', { name: 'Like' }).focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(within(screen.getByRole('group', { name: 'Choose a reaction' })).getByRole('button', { name: 'Hug' })).toBeInTheDocument()
  })
})

describe('NumeroQueRola', () => {
  it('shows the current value (the old one only decorates, hidden from the screen reader)', () => {
    const { rerender, container } = render(<RollingNumber valor={3} />)
    expect(container).toHaveTextContent('3')
    rerender(<RollingNumber valor={4} format={(n) => `${n}!`} />)
    expect(container.querySelector('.vida-rola-atual')).toHaveTextContent('4!')
  })
})

describe('FollowButton with spring, ✓ and "Deixar de seguir"', () => {
  it('the accessible name is only the state; the hover "Deixar de seguir" is hidden from the screen reader; following announces', async () => {
    const ears: string[] = []
    const listen = (e: Event) => ears.push((e as CustomEvent).detail.texto)
    window.addEventListener(NOTICE_EVENT, listen)
    render(<FollowButton uid="rvr_x" seguindo={false} rotulos={{ seguir: 'Seguir', seguindo: 'Seguindo' }} />)
    const b = screen.getByRole('button', { name: 'Seguir' })
    expect(b).toHaveAttribute('aria-pressed', 'false')
    expect(b.querySelector('.life-follow-leave')).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(b)
    expect(h.followAction).toHaveBeenCalledWith('rvr_x', true)
    expect(ears).toEqual(['Você está seguindo'])
    window.removeEventListener(NOTICE_EVENT, listen)
  })
})

describe('GlobalLife: the action notice', () => {
  it('shows the notice in a live region, closes on the button and disappears by itself', async () => {
    vi.useFakeTimers()
    render(<GlobalLife />)
    act(() => notify('Copiado'))
    const region = screen.getAllByRole('status')[0]
    expect(region).toHaveTextContent('Copiado')
    act(() => { vi.advanceTimersByTime(3300) })
    expect(region).not.toHaveTextContent('Copiado')
    act(() => notify('Salvo'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(region).not.toHaveTextContent('Salvo')
  })
  it('an announcement only for the screen reader does not open a visible notice', async () => {
    render(<GlobalLife />)
    act(() => announce('Reação retirada'))
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
    expect(document.querySelector('.life-notice')).toBeNull()
    expect(document.querySelector('.reader-only[aria-live="polite"]')).toHaveTextContent('Reação retirada')
  })
})

describe('NovasPostagens', () => {
  it('asks from time to time; only appears when the top of the line changes; tapping reloads and disappears', async () => {
    vi.useFakeTimers()
    h.topo.mockResolvedValueOnce('ob_1').mockResolvedValueOnce('ob_2')
    render(<NewPosts topo="ob_1" rotulo="Novas postagens" anuncio="Chegaram postagens novas" interval={1000} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.queryByRole('button', { name: 'Novas postagens' })).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    const pill = screen.getByRole('button', { name: 'Novas postagens' })
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
    fireEvent.click(pill)
    expect(h.refresh).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Novas postagens' })).not.toBeInTheDocument()
  })
  it('without a top (empty line or no relay), it does not even ask', async () => {
    vi.useFakeTimers()
    render(<NewPosts topo={null} rotulo="Novas postagens" anuncio="x" interval={1000} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(h.topo).not.toHaveBeenCalled()
  })
})

describe('moments, presence, empty and loading', () => {
  it('the ring loses its color after the moment is seen in this visit', () => {
    const { container } = render(<LiveRing autor="teste_anel" ring="rosa"><span /></LiveRing>)
    const ring = container.querySelector('.life-ring')!
    expect(ring).not.toHaveAttribute('data-visto')
    act(() => markSeen('teste_anel'))
    expect(wasSeen('teste_anel')).toBe(true)
    expect(ring).toHaveAttribute('data-visto', 'true')
  })
  it('"typing" reads the name; the little dots do not', () => {
    const { container } = render(<Typing nome="Pipa" texto="{nome} está digitando" />)
    expect(container).toHaveTextContent('Pipa está digitando')
    expect(container.querySelector('.life-typing-bubble')).toHaveAttribute('aria-hidden', 'true')
  })
  it('the empty state brings Luna at a fixed size (no layout jump): dozing on error, arms behind the head otherwise', () => {
    const token = { corpo: 'seixo', cor: '#f2e8d6', acessorios: [] }
    const { container, rerender } = render(<EmptyState titulo="Nada" texto="ainda" ficha={token} estado="parado" />)
    const img = container.querySelector('.life-luna img')!
    expect(img.getAttribute('src')).toBe('/marca/folgali/simbolos/luna-bracos.webp')
    expect(img).toHaveAttribute('width')
    expect(img).toHaveAttribute('height')
    rerender(<EmptyState titulo="Erro" texto="x" ficha={token} erro />)
    expect(container.querySelector('.life-luna img')!.getAttribute('src')).toBe('/marca/folgali/simbolos/luna-cochilo.webp')
  })
  it('the feed skeleton announces that it is loading and hides the patches from the screen reader', () => {
    render(<PostSkeleton rotulo="Carregando o feed" />)
    const s = screen.getByRole('status')
    expect(s).toHaveAttribute('aria-busy', 'true')
    expect(s).toHaveTextContent('Carregando o feed')
    expect(s.querySelectorAll('.life-left-post[aria-hidden="true"]').length).toBe(2)
  })
  it('the active tab\'s stroke is decorative and disappears with no active item', () => {
    const { container } = render(<nav><span className="tab">x</span><Indicator itens=".tab" /></nav>)
    const dash = container.querySelector('.life-indicator')!
    expect(dash).toHaveAttribute('aria-hidden', 'true')
    expect(dash).toHaveAttribute('data-oculto', '1')
  })
})
