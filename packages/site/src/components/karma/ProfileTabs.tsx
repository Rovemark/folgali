// Posts, Comments and Feed of a profile, as links (no script): `?aba=postagens`, `&sub=respostas` (the address it always had) and
// `&sub=feed` (posts and replies together, newest first).
import Link from 'next/link'
import { META, type Ready } from '@/lib/i18n-base'
import type { KarmaTexts } from '@/i18n/karma'

export type ProfileSub = 'postagem' | 'resposta' | 'feed'

export default function ProfileTabs({ base, atual: current, t, lang, postagens: posts, respostas: replies }: { base: string; atual: ProfileSub; t: KarmaTexts; lang: Ready; postagens?: number; respostas?: number }) {
  const n = (x?: number) => (x === undefined ? null : <span className="km-tab-n">{new Intl.NumberFormat(META[lang].html).format(x)}</span>)
  const tabs: [ProfileSub, string, React.ReactNode][] = [
    ['postagem', t.tabPosts, n(posts)],
    ['resposta', t.tabComments, n(replies)],
    ['feed', t.tabFeed, null],
  ]
  return (
    <nav className="km-tabs" aria-label={t.tabsLabel}>
      {tabs.map(([k, label, num]) => (
        <Link key={k} href={`${base}?aba=postagens${k === 'resposta' ? '&sub=respostas' : k === 'feed' ? '&sub=feed' : ''}`} scroll={false} className="km-tab" aria-current={current === k ? 'page' : undefined}>
          {label} {num}
        </Link>
      ))}
    </nav>
  )
}
