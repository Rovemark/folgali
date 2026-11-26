'use client'

import Link from 'next/link'
import Portrait from '@/components/Portrait'
import { IcQuotes } from '@/components/social/SocialIcons'
import ActionButton from '@/components/social/ActButton'
import SocialText from '@/components/social/SocialText'
import { useMore } from '@/components/social/useMais'
import { fmt, relativeTime, type Dictionary, type Ready } from '@/lib/i18n-base'
import type { Page } from '@/lib/types'
import type { Testimonial } from '@/lib/social/types'
import ContentMenu from './ContentMenu'

type Props = {
  aceitos: Page<Testimonial>
  /** only the owner receives it; pending ones are not public */
  pendentes: Testimonial[]
  ownerUid: string
  ownerHandle: string
  myUid: string | null
  d: Dictionary
  lang: Ready
  agora: string
}

function Letter({ dep, d, lang, agora: now, ownerHandle, myUid, ownerUid, acao: action }: { dep: Testimonial; d: Dictionary; lang: Ready; agora: string; ownerHandle: string; myUid: string | null; ownerUid: string; acao?: React.ReactNode }) {
  const t = d.socPerfil.depoimentos
  return (
    <li className={`pf-letter${dep.estado === 'pendente' ? ' pending' : ''}`} style={{ ['--pelucia' as string]: dep.autor.rosto.cor }}>
      <span className="pf-quote" aria-hidden>
        <IcQuotes />
      </span>
      <SocialText texto={dep.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="pf-letter-text" />
      <footer>
        <Link href={`/${lang}/r/${dep.autor.handle}`} className="pf-slip-author">
          <Portrait ficha={dep.autor.rosto} nome={dep.autor.nome} tamanho={40} decorative />
          <span>
            <strong>{fmt(t.de, { nome: dep.autor.nome })}</strong>
            <small>
              <bdi dir="ltr">@{dep.autor.handle}</bdi> · {dep.estado === 'pendente' ? t.pendente : relativeTime(dep.aceitoEm ?? dep.criadoEm, d, new Date(now))}
            </small>
          </span>
        </Link>
        {dep.estado === 'aceito' && <ContentMenu id={dep.id} tipo="depoimento" authorHandle={dep.autor.handle} ownerHandle={ownerHandle} lang={lang} d={d} meu={myUid === dep.autor.uid} ofOwner={myUid === ownerUid} />}
      </footer>
      {action && <div className="pf-letter-actions">{action}</div>}
    </li>
  )
}

/** Testimonials: the accepted letters for everyone; the pending ones only for the owner, with Accept and Decline. */
export default function TestimonialList({ aceitos: accepted, pendentes: pending, ownerUid, ownerHandle, myUid, d, lang, agora: now }: Props) {
  const t = d.socPerfil.depoimentos
  const { itens: items, proximo: next, pendente: loading, failed, mais: more } = useMore(accepted, { lista: 'depoimentos', de: ownerUid, opcoes: { estado: 'aceitos' } }, (x) => x.id)
  const ofOwner = myUid === ownerUid
  return (
    <>
      {ofOwner && pending.length > 0 && (
        <section className="pf-pending" aria-labelledby="pf-pend-t">
          <h3 id="pf-pend-t">{t.pendentesTitulo}</h3>
          <p className="soft">{t.pendentesTexto}</p>
          <ul className="pf-letters">
            {pending.map((p) => (
              <Letter
                key={p.id}
                dep={p}
                d={d}
                lang={lang}
                agora={now}
                ownerHandle={ownerHandle}
                myUid={myUid}
                ownerUid={ownerUid}
                acao={
                  <>
                    <ActionButton ato={{ tipo: 'depoimento-decisao', depoimento: p.id, decisao: 'aceitar' }} d={d} className="btn btn-primary btn-small">
                      {t.aceitar}
                    </ActionButton>
                    <ActionButton
                      ato={{ tipo: 'depoimento-decisao', depoimento: p.id, decisao: 'recusar' }}
                      d={d}
                      className="btn btn-secondary btn-small"
                      confirmar={{ titulo: t.recusarTitulo, texto: t.recusarTexto, ok: t.recusarOk }}
                    >
                      {t.recusar}
                    </ActionButton>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}
      <ul className="pf-letters" aria-busy={loading}>
        {items.map((p) => (
          <Letter
            key={p.id}
            dep={p}
            d={d}
            lang={lang}
            agora={now}
            ownerHandle={ownerHandle}
            myUid={myUid}
            ownerUid={ownerUid}
            acao={
              ofOwner ? (
                <ActionButton
                  ato={{ tipo: 'depoimento-decisao', depoimento: p.id, decisao: 'recusar' }}
                  d={d}
                  className="btn btn-secondary btn-small"
                  confirmar={{ titulo: t.esconderTitulo, texto: t.esconderTexto, ok: t.esconderOk }}
                >
                  {t.esconder}
                </ActionButton>
              ) : undefined
            }
          />
        ))}
      </ul>
      {next && (
        <div className="pf-more-list">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={loading}>
            {loading ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
