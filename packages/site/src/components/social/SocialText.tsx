import Link from 'next/link'
import { split } from '@/lib/domain/social-text'

/**
 * Draws the text of a rover: an @mention becomes a link to the profile, a #tag becomes a link to the search, and a URL becomes the
 * whole domain highlighted (nothing is fetched or previewed). It never uses HTML: each piece is
 * a React element. A link that does not pass the protocol rules appears as plain text.
 */
export default function SocialText({ texto: text, lang, saindo: leaving, className = '' }: { texto: string; lang: string; saindo: string; className?: string }) {
  return (
    <p className={`social-text ${className}`} dir="auto">
      {split(text).map((p, i) => {
        if (p.t === 'texto') return p.v
        if (p.t === 'mencao')
          return (
            <Link key={i} href={`/${lang}/r/${p.v}`} className="mention">
              @{p.v}
            </Link>
          )
        if (p.t === 'tag')
          return (
            <Link key={i} href={`/${lang}/buscar?q=${encodeURIComponent('#' + p.v)}`} className="hashtag">
              #{p.v}
            </Link>
          )
        if (!p.seguro || !p.dominio) return p.v
        return (
          <a key={i} href={p.v} className="link-exit" rel="noopener noreferrer nofollow ugc" target="_blank" title={`${leaving}: ${p.dominio}`}>
            <span className="reader-only">{leaving}: </span>
            {p.dominio}
            <span className="link-arrow" aria-hidden>↗</span>
          </a>
        )
      })}
    </p>
  )
}
