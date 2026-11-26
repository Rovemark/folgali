import Link from 'next/link'
import Portrait from '@/components/Portrait'
import { IcQuotes } from '@/components/social/SocialIcons'
import SocialText from '@/components/social/SocialText'
import { fmt, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import type { TestimonialSent } from '@/lib/social/types'

type Props = { itens: TestimonialSent[]; d: Dictionary; lang: Ready; agora: string }

/**
 * The testimonials the rover ITSELF wrote and that still await the decision of the page owner (0.3.1, `depoimentos-enviados`). Only the author and the owner
 * see them; no one else. Without this, the writer had no way to know the testimonial was waiting, nor for whom.
 */
export default function SentList({ itens: items, d, lang, agora: now }: Props) {
  const t = d.socPerfil.depoimentos
  if (items.length === 0) return null
  return (
    <section className="pf-pending pf-enviados" aria-labelledby="pf-env-t">
      <h3 id="pf-env-t">{t.enviadosTitulo}</h3>
      <p className="fine">{t.enviadosTexto}</p>
      <ul className="pf-letters">
        {items.map((x) => (
          <li key={x.id} className="pf-letter pending" style={{ ['--pelucia' as string]: x.alvo.rosto.cor }}>
            <span className="pf-quote" aria-hidden>
              <IcQuotes />
            </span>
            <SocialText texto={x.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="pf-letter-text" />
            <footer>
              <Link href={`/${lang}/r/${x.alvo.handle}`} className="pf-slip-author">
                <Portrait ficha={x.alvo.rosto} nome={x.alvo.nome} tamanho={40} decorative />
                <span>
                  <strong>{fmt(t.enviadosPara, { nome: x.alvo.nome })}</strong>
                  <small>
                    <bdi dir="ltr">@{x.alvo.handle}</bdi> · {fmt(t.enviadosEspera, { nome: x.alvo.nome })} · {relativeTime(x.criadoEm, d, new Date(now))}
                  </small>
                </span>
              </Link>
            </footer>
          </li>
        ))}
      </ul>
    </section>
  )
}
