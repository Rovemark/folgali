import { IcPin } from '@/components/social/SocialIcons'
import { relativeTime, type Dictionary } from '@/lib/i18n'
import type { Announcement } from '@/lib/social/types'

/** How much of the announcement shows open at the start; the rest stays behind "Ler o anúncio inteiro" (Read the whole announcement). */
export const ANNOUNCEMENT_PREVIEW = 240

/** The announcements from whoever operates the relay: plain text (React escapes everything), no link, no markup and no request for a reply. */
export default function RelayAnnouncements({ itens: items, d, agora: now }: { itens: Announcement[]; d: Dictionary; agora: string }) {
  if (items.length === 0) return null
  const t = d.socLinha.anuncios
  return (
    <section className="relay-announcements" aria-labelledby="anuncios-rele-t">
      <h2 id="anuncios-rele-t" className="overline">
        {t.titulo}
      </h2>
      <ul aria-label={t.rotulo}>
        {items.map((a) => {
          const long = Array.from(a.texto).length > ANNOUNCEMENT_PREVIEW
          return (
            <li key={a.id} className="announcement">
              <div className="announcement-head">
                <h3>{a.titulo}</h3>
                {a.fixado && (
                  <span className="pill" data-tom="acao">
                    <IcPin /> {t.fixado}
                  </span>
                )}
              </div>
              {long ? (
                <details>
                  <summary>{t.lerTudo}</summary>
                  <p className="announcement-text">{a.texto}</p>
                </details>
              ) : (
                <p className="announcement-text">{a.texto}</p>
              )}
              <p className="fine">{t.publicado.replace('{quando}', relativeTime(a.criadoEm, d, new Date(now)))}</p>
            </li>
          )
        })}
      </ul>
      <p className="fine">{t.nota}</p>
    </section>
  )
}
