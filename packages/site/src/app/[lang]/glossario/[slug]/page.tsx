import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EditorialPage from '@/components/editorial/EditorialPage'
import { contentOf } from '@/content'
import { READY, isReady, type Ready } from '@/lib/i18n'
import { instDict, metaOf } from '@/lib/i18n-extra'
import { definedTerm } from '@/lib/seo/jsonld'
import { pageMeta } from '@/lib/seo/metadata'
import { absoluteUrl, urlBase } from '@/lib/site'

type P = { params: Promise<{ lang: string; slug: string }> }

const find = (lang: Ready, slug: string) => contentOf(lang).verbetes.find((v) => v.slug === slug)
const slugLanguages = (slug: string): Ready[] => READY.filter((l) => find(l, slug) !== undefined)

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params
  const l: Ready = isReady(lang) ? lang : 'pt'
  const v = find(l, slug)
  if (!v) return { title: metaOf(l, 'glossario').titulo }
  return pageMeta({ lang: l, caminho: `/glossario/${slug}`, titulo: v.termo, descricao: v.definicaoCurta, imageId: 'glossario', idiomas: slugLanguages(slug) })
}

export default async function GlossaryEntry({ params }: P) {
  const { lang, slug } = await params
  if (!isReady(lang)) notFound()
  const v = find(lang, slug)
  if (!v) notFound()
  const base = urlBase()
  const e = instDict(lang).editorial
  const all = contentOf(lang).verbetes
  const related = (v.relacionados ?? []).map((s) => all.find((x) => x.slug === s)).filter((x) => x !== undefined)
  return (
    <EditorialPage
      lang={lang}
      titulo={v.termo}
      respostaCurta={v.definicaoCurta}
      atualizadoEm={v.atualizadoEm}
      migalhas={[
        { nome: metaOf(lang, 'glossario').titulo, href: `/${lang}/glossario` },
        { nome: v.termo, href: `/${lang}/glossario/${v.slug}` },
      ]}
      ver={['glossario', 'ajuda']}
      jsonld={[definedTerm(base, lang, v, absoluteUrl(base, lang, '/glossario#conjunto'))]}
    >
      <section className="editorial-section">
        <p>{v.definicao}</p>
      </section>
      {related.length > 0 && (
        <section className="see-also" aria-labelledby="termos-rel-t">
          <h2 id="termos-rel-t">{e.termoRelacionados}</h2>
          <ul>
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/${lang}/glossario/${r.slug}`}>{r.termo}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </EditorialPage>
  )
}
