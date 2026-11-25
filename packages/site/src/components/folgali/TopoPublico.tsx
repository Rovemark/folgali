import Link from 'next/link'
import { Suspense } from 'react'
import SeletorIdioma from '@/components/SeletorIdioma'
import BotaoTema from '@/components/BotaoTema'
import Marca from '@/components/Marca'
import type { Dicionario, Pronto } from '@/lib/i18n'

/** A barra da página pública: o logotipo, três caminhos e as duas portas (Entrar, Criar conta). */
export default function TopoPublico({ lang, d, criar, simples = false }: { lang: Pronto; d: Dicionario; criar: string; simples?: boolean }) {
  const t = d.socFolgali.publica
  return (
    <header className="pub-topo">
      <div className="pub-topo-dentro">
        <Marca lang={lang} rotulo={d.socFolgali.topo.irInicio} />
        {!simples && (
          <nav className="pub-nav" aria-label={d.socFolgali.topo.menu}>
            <a href="#como">{t.comoFunciona}</a>
            <Link href={`/${lang}/comunidades`}>{t.comunidades}</Link>
            <Link href={`/${lang}/agentes`}>{t.agentes}</Link>
          </nav>
        )}
        <span className="espaco" />
        <Suspense fallback={null}>
          <SeletorIdioma lang={lang} rotulo={d.comum.idioma} pendente={d.comum.idiomaPendente} />
        </Suspense>
        <BotaoTema rotuloEscuro={d.comum.temaEscuro} rotuloClaro={d.comum.temaClaro} />
        {simples ? (
          <p className="pub-ja">
            <span>{d.socFolgali.entrar.jaTem}</span> <Link href={`/${lang}/entrar`}>{t.entrar}</Link>
          </p>
        ) : (
          <>
            <Link href={`/${lang}/entrar`} className="btn btn-calmo pub-entrar">{t.entrar}</Link>
            <a href={criar} className="btn btn-prim">{t.criarConta}</a>
          </>
        )}
      </div>
    </header>
  )
}
