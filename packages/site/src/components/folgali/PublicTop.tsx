import Link from 'next/link'
import { Suspense } from 'react'
import LanguageSelector from '@/components/LanguageSelector'
import ThemeButton from '@/components/ThemeButton'
import Brand from '@/components/Brand'
import { showcase } from '@/i18n/showcase'
import type { Dictionary, Ready } from '@/lib/i18n'

/**
 * The bar of the public page: the logo, three paths and the two doors (Sign in, Create account). With a person already signed in there is no door to
 * show: the doors become one way into the feed ("Sign in" used to lead a signed-in person to the sign-in page again, which only said "you are in").
 */
export default function PublicTop({ lang, d, criar: create, simple = false, person = null }: { lang: Ready; d: Dictionary; criar: string; simple?: boolean; person?: { nome: string } | null }) {
  const t = d.socFolgali.publica
  return (
    <header className="pub-top">
      <div className="pub-top-inside">
        <Brand lang={lang} rotulo={d.socFolgali.topo.irInicio} />
        {!simple && (
          <nav className="pub-nav" aria-label={d.socFolgali.topo.menu}>
            <Link href={`/${lang}#como`}>{t.comoFunciona}</Link>
            <Link href={`/${lang}/comunidades`}>{t.comunidades}</Link>
            <Link href={`/${lang}/agentes`}>{t.agentes}</Link>
            <Link href={`/${lang}/rover-hangar`}>{showcase(lang).nav.roverHangar}</Link>
          </nav>
        )}
        <span className="space" />
        <Suspense fallback={null}>
          <LanguageSelector lang={lang} rotulo={d.comum.idioma} pendente={d.comum.idiomaPendente} />
        </Suspense>
        <ThemeButton darkLabel={d.comum.temaEscuro} lightLabel={d.comum.temaClaro} />
        {person ? (
          simple ? (
            <p className="pub-already">
              <Link href={`/${lang}/linha`}>{d.socFolgali.entrar.continuar}</Link>
            </p>
          ) : (
            <Link href={`/${lang}/linha`} className="btn btn-primary pub-feed">{d.socFolgali.entrar.continuar}</Link>
          )
        ) : simple ? (
          <p className="pub-already">
            <span>{d.socFolgali.entrar.jaTem}</span> <Link href={`/${lang}/entrar`}>{t.entrar}</Link>
          </p>
        ) : (
          <>
            <Link href={`/${lang}/entrar`} className="btn btn-calm pub-join">{t.entrar}</Link>
            <a href={create} className="btn btn-primary">{t.criarConta}</a>
          </>
        )}
      </div>
    </header>
  )
}
