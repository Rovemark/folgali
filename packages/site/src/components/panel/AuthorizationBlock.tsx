import { shortDate, fmt, META, type Dictionary, type Ready } from '@/lib/i18n'
import type { Loaded } from '@/lib/social/load'
import { authorizationUsage } from '@/lib/panel/rhythm'
import type { PublishedAction, StandingAuthorization } from '@/lib/panel/types'
import BlockError from './BlockError'

type Props = {
  autorizacao: Loaded<StandingAuthorization | null>
  /** the app log, to count what already went out under the authorization */
  published: PublishedAction[]
  d: Dictionary
  lang: Ready
  agora: string
}

/**
 * The standing authorization (section 6.6 of the protocol), READ ONLY. No button at all: giving, changing or revoking goes through the app, which
 * signs with the approval key. When there is none, the block says there is none and why (on folgali it is signed at sign-up, with no expiry).
 */
export default function AuthorizationBlock({ autorizacao: authorization, published, d, lang, agora: now }: Props) {
  const t = d.socInicio.autorizacao
  return (
    <section className="section pn-block" aria-labelledby="pn-aut-t">
      <div className="section-head">
        <h2 id="pn-aut-t">{t.titulo}</h2>
      </div>
      {!authorization.ok ? (
        <BlockError codigo={authorization.codigo} d={d} />
      ) : authorization.valor === null ? (
        <div className="callout pn-none">
          <strong>{t.nenhumaTitulo}</strong>
          <span>{t.nenhumaTexto}</span>
        </div>
      ) : (
        <Exists a={authorization.valor} published={published} d={d} lang={lang} agora={now} />
      )}
      <p className="pn-fine">{t.somenteLeitura}</p>
    </section>
  )
}

function Exists({ a, published, d, lang, agora: now }: { a: StandingAuthorization; published: PublishedAction[]; d: Dictionary; lang: Ready; agora: string }) {
  const t = d.socInicio.autorizacao
  const names = t.nomes as Record<string, string>
  const usage = authorizationUsage(a, published, new Date(now))
  const list = new Intl.ListFormat(META[lang].html, { style: 'long', type: 'conjunction' }).format(a.tipos.map((x) => names[x] ?? x))
  return (
    <>
      <p>{t.existeTexto}</p>
      {!usage.vigente && (
        <p className="callout callout-notice" role="status">
          {fmt(t.venceu, { data: shortDate(a.expiraEm, lang) })}
        </p>
      )}
      <dl className="pn-auth">
        <div>
          <dt>{t.cobre}</dt>
          <dd>{list}</dd>
        </div>
        <div>
          <dt>{t.vale}</dt>
          <dd>
            <time dateTime={a.expiraEm}>{shortDate(a.expiraEm, lang)}</time>
          </dd>
        </div>
        <div>
          <dt>{t.usoHora}</dt>
          <dd>{fmt(t.uso, { n: usage.atTime, max: a.maxPorHora })}</dd>
        </div>
        <div>
          <dt>{t.usoDia}</dt>
          <dd>{fmt(t.uso, { n: usage.onDay, max: a.maxPorDia })}</dd>
        </div>
      </dl>
    </>
  )
}
