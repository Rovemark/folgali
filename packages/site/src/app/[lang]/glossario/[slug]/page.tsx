import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PaginaEditorial from '@/components/editorial/PaginaEditorial'
import { conteudoDe } from '@/conteudo'
import { PRONTOS, ehPronto, type Pronto } from '@/lib/i18n'
import { instDict, metaDe } from '@/lib/i18n-extra'
import { termoDefinido } from '@/lib/seo/jsonld'
import { metaDaPagina } from '@/lib/seo/metadata'
import { urlAbsoluta, urlBase } from '@/lib/site'

type P = { params: Promise<{ lang: string; slug: string }> }

const achar = (lang: Pronto, slug: string) => conteudoDe(lang).verbetes.find((v) => v.slug === slug)
const idiomasDoSlug = (slug: string): Pronto[] => PRONTOS.filter((l) => achar(l, slug) !== undefined)

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params
  const l: Pronto = ehPronto(lang) ? lang : 'pt'
  const v = achar(l, slug)
  if (!v) return { title: metaDe(l, 'glossario').titulo }
  return metaDaPagina({ lang: l, caminho: `/glossario/${slug}`, titulo: v.termo, descricao: v.definicaoCurta, imagemId: 'glossario', idiomas: idiomasDoSlug(slug) })
}

export default async function Verbete({ params }: P) {
  const { lang, slug } = await params
  if (!ehPronto(lang)) notFound()
  const v = achar(lang, slug)
  if (!v) notFound()
  const base = urlBase()
  const e = instDict(lang).editorial
  const todos = conteudoDe(lang).verbetes
  const relacionados = (v.relacionados ?? []).map((s) => todos.find((x) => x.slug === s)).filter((x) => x !== undefined)
  return (
    <PaginaEditorial
      lang={lang}
      titulo={v.termo}
      respostaCurta={v.definicaoCurta}
      atualizadoEm={v.atualizadoEm}
      migalhas={[
        { nome: metaDe(lang, 'glossario').titulo, href: `/${lang}/glossario` },
        { nome: v.termo, href: `/${lang}/glossario/${v.slug}` },
      ]}
      ver={['glossario', 'ajuda']}
      jsonld={[termoDefinido(base, lang, v, urlAbsoluta(base, lang, '/glossario#conjunto'))]}
    >
      <section className="editorial-secao">
        <p>{v.definicao}</p>
      </section>
      {relacionados.length > 0 && (
        <section className="ver-tambem" aria-labelledby="termos-rel-t">
          <h2 id="termos-rel-t">{e.termoRelacionados}</h2>
          <ul>
            {relacionados.map((r) => (
              <li key={r.slug}>
                <Link href={`/${lang}/glossario/${r.slug}`}>{r.termo}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PaginaEditorial>
  )
}
