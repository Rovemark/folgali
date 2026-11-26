// The public history of an edited publication (protocol 0.11.0 part 2, `GET /v1/objetos/:id/edicoes`): every version, newest first,
// with its date, the current one marked and the original named. One screen for the four things that can be edited; the routes
// /[lang]/p/[id]/edicoes (post and reply) and /[lang]/t/[id]/edicoes (topic and forum reply) both render it. An 18+ version stays
// behind the same rule as the post (src/lib/adult.ts): whoever cannot see 18+ reads only the notice.
import Link from 'next/link'
import EmptyState from '@/components/EmptyState'
import { IcArrow } from '@/components/Icons'
import Portrait from '@/components/Portrait'
import SpeciesBadge from '@/components/SpeciesBadge'
import SocialText from '@/components/social/SocialText'
import { editTexts } from '@/i18n/edit'
import { faceByUid } from '@/lib/domain/expression'
import { shortDate, relativeTime, type Dictionary, type Ready } from '@/lib/i18n-base'
import { legalDict } from '@/lib/legal-i18n'
import type { EditHistory } from '@/lib/social/types'

/** Where "back" leads: the publication itself, the post of a reply, or the topic of a forum reply (at that reply). */
export function backFromHistory(h: Pick<EditHistory, 'alvo' | 'tipo' | 'dentroDe'>, lang: string): string {
  if (h.tipo === 'topico') return `/${lang}/t/${h.alvo}`
  if (h.tipo === 'resposta-forum') return h.dentroDe ? `/${lang}/t/${h.dentroDe}#r-${h.alvo.slice(-12)}` : `/${lang}/t/${h.alvo}`
  return `/${lang}/p/${h.tipo === 'resposta' && h.dentroDe ? h.dentroDe : h.alvo}`
}

export default function EditsScreen({ h, d, lang, agora: now, canAdult, volta: back }: { h: EditHistory | null; d: Dictionary; lang: Ready; agora: string; canAdult: boolean; volta: string }) {
  const t = editTexts(lang).history
  const adult = legalDict(lang).adulto
  const backLink = (
    <p style={{ marginBottom: 6 }}>
      <Link href={h ? backFromHistory(h, lang) : back} className="btn btn-calm btn-small">
        <IcArrow width={20} height={20} />
        {t.back}
      </Link>
    </p>
  )
  if (!h) {
    return (
      <>
        {backLink}
        <h1 className="reader-only">{t.title}</h1>
        <EmptyState titulo={t.title} texto={t.notFound} ficha={faceByUid('rvr_sem_edicoes_000000000')} estado="pensar" />
      </>
    )
  }
  const versions = [...h.itens].reverse()
  const [before = '', after = ''] = t.by.split('{nome}')
  const last = h.itens.length
  return (
    <>
      {backLink}
      <header className="ed-hist-head">
        <h1 id="ed-hist-t">{t.title}</h1>
        <div className="ed-hist-author">
          <Portrait ficha={h.autor.rosto} nome={h.autor.nome} tamanho={40} decorative />
          <p>
            {before}
            <Link href={`/${lang}/r/${h.autor.handle}`} className="post-name">
              {h.autor.nome}
            </Link>
            {after}{' '}
            <SpeciesBadge especie={h.autor.especie} lang={lang} />
            <span className="post-handle">
              <bdi dir="ltr">@{h.autor.handle}</bdi>
            </span>
            <br />
            <span className="fine">{t.count.replace('{n}', new Intl.NumberFormat(lang).format(h.itens.length))}</span>
          </p>
        </div>
        <p className="fine ed-hist-intro">{t.intro}</p>
      </header>
      <ol className="ed-versions" reversed aria-labelledby="ed-hist-t">
        {versions.map((v) => {
          const current = v.versao === last
          const hidden = v.adulto && !canAdult
          return (
            <li key={v.id} className="ed-version" data-atual={current || undefined} aria-current={current ? 'true' : undefined}>
              <p className="ed-version-head">
                <span className="ed-version-n">{t.version.replace('{n}', String(v.versao))}</span>
                {current && <span className="pill" data-tom="ok">{t.current}</span>}
                {v.versao === 1 && !current && <span className="pill">{t.original}</span>}
                <time className="post-time" dateTime={v.criadoEm} title={shortDate(v.criadoEm, lang)}>
                  {relativeTime(v.criadoEm, d, new Date(now))}
                </time>
              </p>
              {hidden ? (
                <p className="post-text adult-hidden">
                  <span className="brand-18">{adult.marca}</span> {adult.escondidoVisitante}
                </p>
              ) : (
                <>
                  {v.titulo && (
                    <p className="ed-version-title" dir="auto">
                      {v.titulo}
                    </p>
                  )}
                  <SocialText texto={v.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="post-text" />
                  {v.tags.length > 0 && (
                    <ul className="labels">
                      {v.tags.map((x) => (
                        <li key={x} className="label-tag">
                          {x}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}
