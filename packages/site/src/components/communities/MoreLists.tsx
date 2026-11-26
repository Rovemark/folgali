'use client'

import Link from 'next/link'
import { IcFlag } from '@/components/Icons'
import RoverCard from '@/components/social/RoverCard'
import { useMore } from '@/components/social/useMais'
import type { Dictionary } from '@/lib/i18n-base'
import { relativeTime } from '@/lib/i18n-base'
import type { MemberItem, ModerationLog, TopicCardData, Vocabulary } from '@/lib/social/types'
import type { Page } from '@/lib/types'
import TopicCard from './TopicCard'

function Footer({ proximo: next, pendente: pending, failed, mais: more, d }: { proximo?: string; pendente: boolean; failed: boolean; mais: () => void; d: Dictionary }) {
  if (!next && !failed) return null
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8, marginTop: 12 }}>
      {next && (
        <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
          {pending ? d.comum.carregando : d.comum.carregarMais}
        </button>
      )}
      {failed && (
        <p className="error-field" role="alert">
          {d.socComum.erros.outro.titulo}. {d.comum.tentarDeNovo}.
        </p>
      )}
    </div>
  )
}

/** More topics of a community list, with the same filter as the first page. */
export function TopicsMore({ initial, comunidade: community, opcoes: options, d, lang, agora: now, vocabulario: vocabulary }: { initial: Page<TopicCardData>; comunidade: string; opcoes: Record<string, string>; d: Dictionary; lang: string; agora: string; vocabulario?: Vocabulary }) {
  const { itens: items, proximo: next, pendente: pending, failed, mais: more } = useMore(initial, { lista: 'topicos', de: community, opcoes: options }, (t) => t.id)
  return (
    <>
      <div className="topics-list" role="feed" aria-busy={pending}>
        {items.map((t) => (
          <TopicCard key={t.id} t={t} d={d} lang={lang} agora={now} vocabulario={vocabulary} />
        ))}
      </div>
      <Footer proximo={next} pendente={pending} failed={failed} mais={more} d={d} />
    </>
  )
}


export function MembersMore({ initial, comunidade: community, d, lang, agora: now }: { initial: Page<MemberItem>; comunidade: string; d: Dictionary; lang: string; agora: string }) {
  const { itens: items, proximo: next, pendente: pending, failed, mais: more } = useMore(initial, { lista: 'membros', de: community }, (m) => m.rover.uid)
  return (
    <>
      <ul className="members-list">
        {items.map((m) => (
          <li key={m.rover.uid}>
            <RoverCard
              rover={m.rover}
              lang={lang}
              extra={
                <>
                  <span className="pill" data-tom={m.papel === 'membro' ? undefined : 'acao'}>
                    {d.socComum.papeis[m.papel]}
                  </span>
                  <span className="fine">{d.socComunidades.pagina.desde.replace('{quando}', relativeTime(m.desde, d, new Date(now)))}</span>
                </>
              }
            />
          </li>
        ))}
      </ul>
      <Footer proximo={next} pendente={pending} failed={failed} mais={more} d={d} />
    </>
  )
}

export function LogItem({ r, d, lang, agora: now }: { r: ModerationLog; d: Dictionary; lang: string; agora: string }) {
  const t = d.socModeracao.registro
  const roverTarget = typeof r.alvo === 'object' ? r.alvo : null
  return (
    <li className="log-item">
      <span className="log-icon" aria-hidden>
        <IcFlag />
      </span>
      <div className="log-body">
        <p>
          <strong>{t.acao[r.acao]}</strong>
          {roverTarget ? (
            <>
              {': '}
              <Link href={`/${lang}/r/${roverTarget.handle}`}>
                {roverTarget.nome} <span className="fine"><bdi dir="ltr">@{roverTarget.handle}</bdi></span>
              </Link>
            </>
          ) : (
            r.alvoTipo && (
              <>
                {': '}
                {r.acao === 'dispensa' ? ((t.tipos as Record<string, string>)[r.alvoTipo] ?? r.alvoTipo) : t.alvoConteudo.replace('{tipo}', (t.tipos as Record<string, string>)[r.alvoTipo] ?? r.alvoTipo)}
              </>
            )
          )}
        </p>
        <p className="fine">
          {d.socComum.motivosModeracao[r.motivo]} · {t.por.replace('{papel}', t.papel[r.por])} · {relativeTime(r.em, d, new Date(now))}
          {r.apelacao && <> · <span className="pill" data-tom={r.apelacao === 'revertida' ? 'ok' : r.apelacao === 'aberta' ? 'aviso' : undefined}>{t.apelacao[r.apelacao]}</span></>}
        </p>
      </div>
    </li>
  )
}

export function LogMore({ initial, comunidade: community, d, lang, agora: now }: { initial: Page<ModerationLog>; comunidade: string; d: Dictionary; lang: string; agora: string }) {
  const { itens: items, proximo: next, pendente: pending, failed, mais: more } = useMore(initial, { lista: 'registroDaComunidade', de: community }, (r) => r.id)
  return (
    <>
      <ol className="log-list">
        {items.map((r) => (
          <LogItem key={r.id} r={r} d={d} lang={lang} agora={now} />
        ))}
      </ol>
      <Footer proximo={next} pendente={pending} failed={failed} mais={more} d={d} />
    </>
  )
}

