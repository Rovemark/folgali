'use client'

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'

/** Below this width the footer columns fold into collapsible groups (keep in sync with src/app/footer.css). */
const NARROW = '(max-width: 719px)'

/**
 * A footer column that folds on phones. The markup is a `<details>` that starts OPEN, so without JavaScript (and on wide screens)
 * every link is there; once mounted on a narrow screen it closes, and the column title becomes the button that opens it. On wide
 * screens the title is only a title: a click does not fold the column. `alwaysOpen` keeps a column unfoldable (the one that carries
 * a link the legal team requires in plain sight, like Contact).
 */
export default function FooterGroup({ id, title, alwaysOpen = false, children }: { id: string; title: string; alwaysOpen?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || alwaysOpen || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(NARROW)
    const apply = () => { el.open = !mq.matches }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [alwaysOpen])
  const keep = (e: MouseEvent) => {
    if (alwaysOpen || typeof window.matchMedia !== 'function' || !window.matchMedia(NARROW).matches) e.preventDefault()
  }
  return (
    <section aria-labelledby={id} className="footer-group" data-fixed={alwaysOpen || undefined}>
      <details ref={ref} open>
        <summary onClick={keep}>
          <h2 id={id}>{title}</h2>
        </summary>
        {children}
      </details>
    </section>
  )
}
