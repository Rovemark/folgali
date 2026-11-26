import { IcLock } from '@/components/Icons'
import type { Dictionary } from '@/lib/i18n-base'

/** What the person needs to know before chatting: what the relay sees (always) and that the demonstration is invented (in the fake client). */
export default function MessageNotices({ demo, d }: { demo: boolean; d: Dictionary }) {
  const t = d.socMensagens
  return (
    <div className="msg-notices">
      {demo && (
        <p className="pf-note" role="note">
          {t.demo}
        </p>
      )}
      <p className="msg-privacy" role="note">
        <IcLock width={18} height={18} aria-hidden /> <span>{t.privacidade}</span>
      </p>
    </div>
  )
}
