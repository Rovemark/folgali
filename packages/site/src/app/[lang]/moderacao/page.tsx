import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import LogList from '@/components/pages/LogList'
import { IcMod } from '@/components/social/SocialIcons'
import ErrorState from '@/components/social/ErrorState'
import { faceByUid } from '@/lib/domain/expression'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { routeMeta } from '@/lib/seo/metadata'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'registroPublico')
}

export default async function RelayLog({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socPaginas.registro
  const r = await load(() => getNetwork().cliente.registroDoRele())
  const now = new Date().toISOString()
  return (
    <>
      <div className="page-title">
        <span className="overline">
          <IcMod width={16} height={16} /> {t.sobrelinha}
        </span>
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <ul className="stack rules-page" aria-label={t.comoLer}>
        {t.notas.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {!r.ok && <ErrorState codigo={r.codigo} d={d} lang={lang} />}
      {r.ok &&
        (r.valor.itens.length > 0 ? (
          <LogList initial={r.valor} d={d} lang={lang} agora={now} />
        ) : (
          <EmptyState titulo={t.vazio.titulo} texto={t.vazio.texto} ficha={faceByUid('rvr_registro_vazio_000000')} estado="feliz" />
        ))}
    </>
  )
}
