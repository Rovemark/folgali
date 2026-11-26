import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EditorialPage, { Sections } from '@/components/editorial/EditorialPage'
import { contentOf } from '@/content'
import { READY, isReady, type Ready } from '@/lib/i18n'
import { instDict, metaOf } from '@/lib/i18n-extra'
import { technicalArticle, faq as jsonFaq } from '@/lib/seo/jsonld'
import { pageMeta } from '@/lib/seo/metadata'
import { urlBase } from '@/lib/site'

type P = { params: Promise<{ lang: string; slug: string }> }

const find = (lang: Ready, slug: string) => contentOf(lang).guias.find((g) => g.slug === slug)
const slugLanguages = (slug: string): Ready[] => READY.filter((l) => find(l, slug) !== undefined)

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params
  const l: Ready = isReady(lang) ? lang : 'pt'
  const g = find(l, slug)
  if (!g) return { title: metaOf(l, 'guias').titulo }
  return pageMeta({ lang: l, caminho: `/guias/${slug}`, titulo: g.titulo, descricao: g.descricao, tipo: 'article', imageId: 'guias', idiomas: slugLanguages(slug) })
}

export default async function GuidePage({ params }: P) {
  const { lang, slug } = await params
  if (!isReady(lang)) notFound()
  const g = find(lang, slug)
  if (!g) notFound()
  const base = urlBase()
  const e = instDict(lang).editorial
  const faq = contentOf(lang).faq
  const questions = (g.perguntas ?? []).map((id) => faq.find((f) => f.id === id)).filter((f) => f !== undefined)
  return (
    <EditorialPage
      lang={lang}
      titulo={g.titulo}
      respostaCurta={g.respostaCurta}
      atualizadoEm={g.atualizadoEm}
      fontes={g.fontes}
      migalhas={[
        { nome: metaOf(lang, 'guias').titulo, href: `/${lang}/guias` },
        { nome: g.titulo, href: `/${lang}/guias/${g.slug}` },
      ]}
      ver={['guias', 'ajuda', 'protocolo']}
      jsonld={[technicalArticle(base, lang, g), ...(questions.length > 0 ? [jsonFaq(questions)] : [])]}
    >
      <Sections secoes={g.secoes} />
      {questions.length > 0 && (
        <section className="faq-group" aria-labelledby="perguntas-guia-t">
          <h2 id="perguntas-guia-t">{e.perguntasDoGuia}</h2>
          {questions.map((f) => (
            <div key={f.id} className="faq-item">
              <h3>
                <Link href={`/${lang}/ajuda#${f.id}`}>{f.pergunta}</Link>
              </h3>
              <p className="brief">{f.respostaCurta}</p>
            </div>
          ))}
        </section>
      )}
    </EditorialPage>
  )
}
