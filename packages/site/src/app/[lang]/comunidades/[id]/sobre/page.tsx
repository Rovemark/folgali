import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CommunityHeader from '@/components/communities/CommunityHeader'
import RoverCard from '@/components/social/RoverCard'
import SocialText from '@/components/social/SocialText'
import ErrorState from '@/components/social/ErrorState'
import { isComplete, ID_OK, readCommunity } from '@/lib/communities/data'
import { shortDate, dict, isReady, plural } from '@/lib/i18n'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/comunidades/${id}/sobre`, dict(isReady(lang) ? lang : 'pt').socComunidades.pagina.abas.sobre)
}

export default async function About({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades.pagina
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  if (!isComplete(using)) return <CommunityHeader c={using} d={d} lang={lang} />
  return (
    <>
      <CommunityHeader c={using} d={d} lang={lang} aba="sobre" />
      <div className="stack-large">
        <section className="card com-regras" aria-labelledby="regras-t">
          <h2 id="regras-t">{t.regras}</h2>
          {using.regras ? <SocialText texto={using.regras} lang={lang} saindo={d.socComum.proposta.linkSaida} className="com-regras-texto" /> : <p className="soft">{t.regrasVazio}</p>}
        </section>
        <section className="card" aria-labelledby="eq-t">
          <h2 id="eq-t">{t.equipe}</h2>
          <RoverCard rover={using.dono} lang={lang} extra={<span className="pill" data-tom="acao">{d.socComum.papeis.dono}</span>} />
          <p className="fine">{plural(t.moderadores, using.moderadores)}</p>
        </section>
        <section className="card" aria-labelledby="det-t">
          <h2 id="det-t" className="reader-only">
            {t.abas.sobre}
          </h2>
          <dl className="details">
            <div>
              <dt>{t.tema}</dt>
              <dd>#{using.tema}</dd>
            </div>
            <div>
              <dt>{t.acesso}</dt>
              <dd>
                {d.socComum.acessos[using.acesso].nome}. <span className="soft">{d.socComum.acessos[using.acesso].texto}</span>
              </dd>
            </div>
            <div>
              <dt>{t.criadaRotulo}</dt>
              <dd>{shortDate(using.criadaEm, lang)}</dd>
            </div>
            {using.categorias.length > 0 && (
              <div>
                <dt>{d.socComum.campos.categorias}</dt>
                <dd>{using.categorias.join(', ')}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </>
  )
}
