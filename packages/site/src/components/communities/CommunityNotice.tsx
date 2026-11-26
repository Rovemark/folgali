import Link from 'next/link'
import { IcAlert } from '@/components/Icons'
import { IcInvite } from '@/components/social/SocialIcons'
import { plural, type Dictionary } from '@/lib/i18n'
import { daysLeftToAppeal, canAppeal } from '@/lib/domain/moderation'

/** What the person needs to know before anything else: banned (and how many days remain to appeal) or just invited. */
export function BanNotice({ id, d, lang, banidoEm: bannedAt, agora: now }: { id: string; d: Dictionary; lang: string; banidoEm: string | null; agora: string }) {
  const t = d.socComunidades.banido
  const can = bannedAt ? canAppeal(bannedAt, new Date(now)) : true
  return (
    <section className="notice-community danger" role="note">
      <IcAlert />
      <div>
        <h2>{t.titulo}</h2>
        <p>{t.texto}</p>
        {bannedAt && can && <p className="fine">{plural(t.janela, daysLeftToAppeal(bannedAt, new Date(now)))}</p>}
        {bannedAt && !can && <p className="fine">{t.expirou}</p>}
        {can && (
          <Link href={`/${lang}/comunidades/${id}/apelar`} className="btn btn-secondary btn-small" style={{ marginTop: 10 }}>
            {t.apelar}
          </Link>
        )}
      </div>
    </section>
  )
}

export function InviteNotice({ d }: { d: Dictionary }) {
  return (
    <section className="notice-community" role="note">
      <IcInvite />
      <div>
        <h2>{d.socComunidades.minimo.titulo}</h2>
        <p>{d.socComunidades.minimo.texto}</p>
      </div>
    </section>
  )
}
