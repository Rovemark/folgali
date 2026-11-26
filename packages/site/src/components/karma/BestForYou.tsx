// "Best for you", the column next to the feed and the profile: Top of all time, Hot this month and Rising. It reads the relay (the
// cached ordered lists of revision 0.10.0); a relay without them, or an empty one, makes the blocks disappear. In the demonstration
// the numbers are examples and say so.
import Link from 'next/link'
import Portrait from '@/components/Portrait'
import { fmt, plural, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import { karmaTexts } from '@/i18n/karma'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import type { Post } from '@/lib/types'

const summary = (text: string) => {
  const c = [...text.replace(/\s+/g, ' ').trim()]
  return c.length > 80 ? `${c.slice(0, 78).join('')}…` : c.join('')
}
const points = (p: Post) => (p.setas?.acima ?? 0) - (p.setas?.abaixo ?? 0)

export default async function BestForYou({ lang, d, agora: now }: { lang: Ready; d: Dictionary; agora: Date }) {
  const t = karmaTexts(lang)
  const { cliente: client } = getNetwork()
  const [top, mes, rises] = await Promise.all([
    load(() => client.postagensOrdenadas({ ordem: 'top', janela: 'sempre', limite: 3 })),
    load(() => client.postagensOrdenadas({ ordem: 'top', janela: 'mes', limite: 6 })),
    load(() => client.ranking('subindo', { limite: 3 })),
  ])
  const example = client.modo === 'falso'
  const always = top.ok ? top.valor.itens.slice(0, 3) : []
  // the month list leaves out what the all-time list already shows
  const seen = new Set(always.map((p) => p.id))
  const blocks: [string, Post[]][] = [
    [t.bestTopAllTime, always],
    [t.bestHotMonth, mes.ok ? mes.valor.itens.filter((p) => !seen.has(p.id)).slice(0, 3) : []],
  ]
  const rising = rises.ok ? rises.valor.itens.slice(0, 3) : []
  if (blocks.every(([, l]) => l.length === 0) && rising.length === 0) return null
  return (
    <section className="box lat-block km-melhores" aria-labelledby="km-melhores-t">
      <div className="lat-head">
        <h2 id="km-melhores-t" className="lat-title">{t.bestTitle}</h2>
        {example && <span className="km-example" title={t.exampleNote}>{t.exampleLabel}</span>}
      </div>
      {blocks.map(([title, list]) => list.length > 0 && (
        <div key={title} className="km-best-block">
          <h3 className="overline">{title}</h3>
          <ol className="km-best-list">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={`/${lang}/p/${p.id}`} className="km-best">
                  <span className="km-best-title" dir="auto">{summary(p.texto)}</span>
                  <span className="fine">
                    {plural(t.score, points(p))} · {plural(t.comments, p.respostas)} · {relativeTime(p.criadaEm, d, now)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {rising.length > 0 && (
        <div className="km-best-block">
          <h3 className="overline">{t.bestRising}</h3>
          <ol className="km-best-list">
            {rising.map((i) => (
              <li key={i.autor.uid}>
                <Link href={`/${lang}/r/${i.autor.handle}`} className="km-best km-best-author">
                  <Portrait ficha={i.autor.rosto} nome={i.autor.nome} tamanho={32} decorative />
                  <span>
                    <span className="km-best-title">{i.autor.nome}</span>
                    <span className="fine">{fmt(t.gain, { n: i.ganho ?? 0 })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
      <Link href={`/${lang}/ranking`} className="lat-view">{t.seeRanking}</Link>
    </section>
  )
}
