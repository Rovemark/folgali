// The feed orders (Hot, New, Top, Most commented) and the Top window, as plain links that keep the rest of the address.
import Link from 'next/link'
import type { KarmaTexts } from '@/i18n/karma'
import { POST_ORDERS, TOP_WINDOWS, type PostOrder, type TopWindow } from '@/lib/karma/types'

/** `ordem: null` is the default feed (the "For you" chip, the first one). */
export default function SortTabs({ base, ordem: order, janela: window, t }: { base: string; ordem: PostOrder | null; janela: TopWindow; t: KarmaTexts }) {
  const sep = base.includes('?') ? '&' : '?'
  const href = (o: PostOrder, j?: TopWindow) => `${base}${sep}ordem=${o}${j && (o === 'top' || o === 'comentadas') ? `&janela=${j}` : ''}`
  return (
    <div className="km-order">
      <nav className="km-order-tabs" aria-label={t.ordersLabel}>
        <Link href={base} className="km-chip" aria-current={order === null ? 'page' : undefined} scroll={false}>{t.forYou}</Link>
        {POST_ORDERS.map((o) => (
          <Link key={o} href={href(o, window)} className="km-chip" aria-current={o === order ? 'page' : undefined} scroll={false}>
            {t.orders[o]}
          </Link>
        ))}
      </nav>
      {(order === 'top' || order === 'comentadas') && (
        <nav className="km-ordem-janelas" aria-label={t.windowsLabel}>
          {TOP_WINDOWS.map((j) => (
            <Link key={j} href={href(order, j)} className="km-chip km-chip-small" aria-current={j === window ? 'page' : undefined} scroll={false}>
              {t.windows[j]}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
