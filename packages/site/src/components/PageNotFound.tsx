import Link from 'next/link'
import EmptyState from '@/components/EmptyState'
import { IcSearch } from '@/components/folgali/Icons'
import { faceByUid } from '@/lib/domain/expression'
import { SCENES } from '@/lib/folgali/scenes'
import { dict, type Ready } from '@/lib/i18n'
import { labelOf } from '@/lib/i18n-extra'
import { ROUTES } from '@/lib/seo/routes'

// Where to send someone who got the address wrong: the door of each part of the site, in their language.
const SUGGESTIONS = ['descobrir', 'comunidades', 'ajuda', 'glossario', 'protocolo'] as const

/**
 * The 404 inside the whole site (top bar, menu, footer): the lost-in-the-woods scene, a search and the useful ways out. The same
 * content for `notFound()` inside a page and for an address that does not exist at all (served with a real 404 by the proxy).
 */
export default function PageNotFound({ lang }: { lang: Ready }) {
  const d = dict(lang)
  const search = d.socFolgali.topo.buscar
  return (
    <div className="not-found">
      <EmptyState
        titulo={d.erro.naoEncontradoTitulo}
        texto={d.erro.naoEncontradoTexto}
        ficha={faceByUid('rvr_nao_encontrado_0000000')}
        scene={SCENES.notFoundForest}
        acoes={
          <>
            <form className="not-found-search" action={`/${lang}/buscar`} method="get" role="search">
              <label htmlFor="busca-404" className="reader-only">{search}</label>
              <IcSearch />
              <input id="busca-404" name="q" type="search" placeholder={search} autoComplete="off" maxLength={100} />
              <button type="submit" className="btn btn-primary btn-small">{search}</button>
            </form>
            <Link href={`/${lang}`} className="btn btn-primary">
              {d.comum.irParaLinha}
            </Link>
            {SUGGESTIONS.map((id) => (
              <Link key={id} href={`/${lang}${ROUTES.find((r) => r.id === id)!.caminho}`} className="btn">
                {labelOf(lang, id)}
              </Link>
            ))}
          </>
        }
      />
    </div>
  )
}
