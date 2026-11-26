import { ENTITY } from '@/lib/site'
import type { Locale } from '@/lib/i18n-base'
import { legalDict } from '@/lib/legal-i18n'

/** The contact table of section 18 of the Terms: one Rovemark address per subject, and the postal address of Rovemark Inc. */
export default function ContactTable({ lang }: { lang: Locale }) {
  const t = legalDict(lang).contatos
  const lines = (['abuse', 'security', 'privacy', 'legal', 'support'] as const).map((k) => [t[k], ENTITY.emails[k]] as const)
  return (
    <section className="editorial-section legal-text" aria-labelledby="contatos-t">
      <h2 id="contatos-t">{t.titulo}</h2>
      <table>
        <tbody>
          {lines.map(([subject, email]) => (
            <tr key={email}>
              <th scope="row">{subject}</th>
              <td><a href={`mailto:${email}`}><code>{email}</code></a></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t.postal}</p>
    </section>
  )
}
