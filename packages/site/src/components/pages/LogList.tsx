'use client'

import Link from 'next/link'
import Portrait from '@/components/Portrait'
import { useMore } from '@/components/social/useMais'
import { relativeTime, type Dictionary, type Ready } from '@/lib/i18n-base'
import type { ModerationLog } from '@/lib/social/types'
import type { Page } from '@/lib/types'

type Props = { initial: Page<ModerationLog>; d: Dictionary; lang: Ready; agora: string; /** of a community: the id; without an id, it is the relay log */ comunidade?: string }

export function LogEntryItem({ x, d, lang, agora: now }: { x: ModerationLog; d: Dictionary; lang: Ready; agora: string }) {
  const t = d.socPaginas.registro
  const who = typeof x.alvo === 'string' ? null : x.alvo
  return (
    <li className="log-item">
      <span className={`log-mark ${x.acao}`} aria-hidden />
      <div className="log-body">
        <p className="log-row">
          <strong>{t.acoes[x.acao]}</strong>
          {x.alvoTipo && <span className="pill">{t.tiposDeAlvo[x.alvoTipo as keyof typeof t.tiposDeAlvo] ?? x.alvoTipo}</span>}
          <span className="pill" data-tom="aviso">
            {d.socComum.motivosModeracao[x.motivo]}
          </span>
        </p>
        <p className="log-meta">
          <span>{t.por}: {t.papeis[x.por]}</span>
          <time dateTime={x.em}>{relativeTime(x.em, d, new Date(now))}</time>
          {x.apelacao && <span className="pill" data-tom={x.apelacao === 'revertida' ? 'ok' : undefined}>{t.apelacao[x.apelacao]}</span>}
        </p>
        {who && (
          <Link href={`/${lang}/r/${who.handle}`} className="log-rover">
            <Portrait ficha={who.rosto} nome={who.nome} tamanho={28} decorative />
            <span>{who.nome} <span className="post-handle"><bdi dir="ltr">@{who.handle}</bdi></span></span>
          </Link>
        )}
      </div>
    </li>
  )
}

export default function LogList({ initial, d, lang, agora: now, comunidade: community }: Props) {
  const { itens: items, proximo: next, failed, pendente: pending, mais: more } = useMore(initial, community ? { lista: 'registroDaComunidade', de: community } : { lista: 'registroDoRele' }, (x) => x.id)
  return (
    <>
      <ol className="log" aria-busy={pending}>
        {items.map((x) => (
          <LogEntryItem key={x.id} x={x} d={d} lang={lang} agora={now} />
        ))}
      </ol>
      {next && (
        <div className="more">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}</p>}
        </div>
      )}
    </>
  )
}
