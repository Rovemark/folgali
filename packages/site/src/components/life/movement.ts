// The movement of folgali, on the JavaScript side. The durations and the springs live in one place: the `--vida-*` tokens on the :root of
// src/app/folgali-life.css. Here the token is only read; no magic numbers scattered around. With "reduce motion" on, nothing animates:
// the state change happens directly (the CSS does the same for transitions).

export const noMotion = (): boolean =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Reads a movement token from :root (`--vida-mola`, `--vida-medio`...). */
export function token(name: string, defaultValue: string): string {
  if (typeof document === 'undefined') return defaultValue
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || defaultValue
}

/** Duration of a token in milliseconds ("200ms" or "0.2s"). */
export function ms(name: string, defaultValue: number): number {
  const v = token(name, '')
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return defaultValue
  return v.endsWith('ms') ? n : n * 1000
}

/**
 * Animates with the Web Animations API, using the spring and the duration of the tokens. Returns null when it does not animate (no motion, no
 * element, browser without `animate`): the caller goes on normally, because the final state is already in the CSS.
 */
export function runAnimation(el: Element | null | undefined, frames: Keyframe[], options: { duracao?: string; mola?: string; delay?: number; fill?: FillMode } = {}): Animation | null {
  if (!el || noMotion() || typeof (el as HTMLElement).animate !== 'function') return null
  return (el as HTMLElement).animate(frames, {
    duration: ms(options.duracao ?? '--vida-medio', 200),
    easing: token(options.mola ?? '--vida-mola', 'cubic-bezier(.2,.8,.2,1.2)'),
    delay: options.delay ?? 0,
    fill: options.fill ?? 'none',
  })
}

type WithTransition = Document & { startViewTransition?: (fn: () => void) => { ready: Promise<void> } }

/**
 * Swaps the theme with a circle that opens from the button (View Transitions API). Without the API or without motion, it swaps at once.
 * `apply` changes the attribute of <html>; it is called only once, on any path.
 */
export function switchWithCircle(origin: { x: number; y: number } | null, apply: () => void): void {
  const doc = document as WithTransition
  if (!doc.startViewTransition || noMotion()) {
    apply()
    return
  }
  const x = origin?.x ?? window.innerWidth - 40
  const y = origin?.y ?? 30
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  document.documentElement.dataset.lifeTheme = '1'
  const t = doc.startViewTransition(apply)
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: ms('--vida-tema', 420), easing: token('--vida-saida', 'ease-out'), pseudoElement: '::view-transition-new(root)' },
      ).finished.finally(() => { delete document.documentElement.dataset.lifeTheme })
    })
    .catch(() => { delete document.documentElement.dataset.lifeTheme })
}
