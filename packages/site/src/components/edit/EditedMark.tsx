// The discreet mark "edited" next to the time of a publication that was edited (protocol 0.11.0 part 2): it says when and how many
// versions there are, and leads to the public history. No state, so it renders on the server and inside client lists alike.
import Link from 'next/link'
import { editTexts } from '@/i18n/edit'
import { relativeTime, type Dictionary, type Locale } from '@/lib/i18n-base'
import type { EditMark } from '@/lib/domain/edit'

export default function EditedMark({ marca: brand, href, d, lang, agora: now }: { marca: EditMark; href: string; d: Dictionary; lang: Locale; agora: string }) {
  const t = editTexts(lang)
  const title = t.markTitle.replace('{quando}', relativeTime(brand.em, d, new Date(now))).replace('{n}', new Intl.NumberFormat(lang).format(brand.versoes))
  return (
    <Link href={href} className="edited-mark" title={title} aria-label={title}>
      {t.mark}
    </Link>
  )
}
