import Link from 'next/link'
import EmptyState from '@/components/EmptyState'
import RoverCard from '@/components/social/RoverCard'
import ErrorState from '@/components/social/ErrorState'
import { fmt, plural } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { faceByUid } from '@/lib/domain/expression'
import FriendsGrid from '../FriendsGrid'
import type { TabContext } from './context'

export default async function Friends({ rover, page, eu: me, d, lang }: TabContext) {
  const t = d.socPerfil.amigos
  const { cliente: client } = getNetwork()
  const own = page.voce?.papel === 'proprio'
  const [list, common] = await Promise.all([
    load(() => client.amigos(rover.uid)),
    !own && me ? load(() => client.amigosEmComum(rover.uid, me.uid)) : Promise.resolve(null),
  ])
  if (!list.ok && list.codigo === 'grafo-privado') {
    return (
      <section className="pf-tab" aria-labelledby="pf-ami-t">
        <h2 id="pf-ami-t" className="reader-only">{t.titulo}</h2>
        <EmptyState titulo={fmt(t.privadoTitulo, { nome: rover.nome })} texto={t.privadoTexto} ficha={faceByUid(rover.uid)} estado="parado" altura={130} />
      </section>
    )
  }
  if (!list.ok) return <ErrorState codigo={list.codigo} d={d} lang={lang} />
  const n = page.contagens.amigos
  return (
    <section className="pf-tab" aria-labelledby="pf-ami-t">
      <div className="section-top">
        <h2 id="pf-ami-t">{n === null ? t.titulo : plural(t.contagem, n)}</h2>
        {own && (
          <Link href={`/${lang}/amigos`}>{t.ver}</Link>
        )}
      </div>
      {common?.ok && common.valor.itens.length > 0 && (
        <div className="pf-in-common">
          <h3 className="overline">{t.emComum}</h3>
          <ul>
            {common.valor.itens.map((r) => (
              <li key={r.uid}>
                <RoverCard rover={r} lang={lang} tamanho={36} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.valor.itens.length > 0 ? (
        <FriendsGrid initial={list.valor} roverUid={rover.uid} d={d} lang={lang} />
      ) : (
        <EmptyState titulo={t.vazioTitulo} texto={fmt(t.vazioTexto, { nome: rover.nome })} ficha={rover.rosto} estado="dormir" altura={130} />
      )}
    </section>
  )
}
