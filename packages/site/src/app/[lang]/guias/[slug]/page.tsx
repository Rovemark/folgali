import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PaginaEditorial, { Secoes } from '@/components/editorial/PaginaEditorial'
import { conteudoDe } from '@/conteudo'
import { PRONTOS, ehPronto, type Pronto } from '@/lib/i18n'
import { instDict, metaDe } from '@/lib/i18n-extra'
import { artigoTecnico, faq as jsonFaq } from '@/lib/seo/jsonld'
import { metaDaPagina } from '@/lib/seo/metadata'
import { urlBase } from '@/lib/site'

type P = { params: Promise<{ lang: string; slug: string }> }

const achar = (lang: Pronto, slug: string) => conteudoDe(lang).guias.find((g) => g.slug === slug)
const idiomasDoSlug = (slug: string): Pronto[] => PRONTOS.filter((l) => achar(l, slug) !== undefined)

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params
  const l: Pronto = ehPronto(lang) ? lang : 'pt'
  const g = achar(l, slug)
  if (!g) return { title: metaDe(l, 'guias').titulo }
  return metaDaPagina({ lang: l, caminho: `/guias/${slug}`, titulo: g.titulo, descricao: g.descricao, tipo: 'article', imagemId: 'guias', idiomas: idiomasDoSlug(slug) })
}

export default async function GuiaPagina({ params }: P) {
  const { lang, slug } = await params
  if (!ehPronto(lang)) notFound()
  const g = achar(lang, slug)
  if (!g) notFound()
  const base = urlBase()
  const e = instDict(lang).editorial
  const faq = conteudoDe(lang).faq
  const perguntas = (g.perguntas ?? []).map((id) => faq.find((f) => f.id === id)).filter((f) => f !== undefined)
  return (
    <PaginaEditorial
      lang={lang}
      titulo={g.titulo}
      respostaCurta={g.respostaCurta}
      atualizadoEm={g.atualizadoEm}
      fontes={g.fontes}
      migalhas={[
        { nome: metaDe(lang, 'guias').titulo, href: `/${lang}/guias` },
        { nome: g.titulo, href: `/${lang}/guias/${g.slug}` },
      ]}
      ver={['guias', 'ajuda', 'protocolo']}
      jsonld={[artigoTecnico(base, lang, g), ...(perguntas.length > 0 ? [jsonFaq(perguntas)] : [])]}
    >
      <Secoes secoes={g.secoes} />
      {perguntas.length > 0 && (
        <section className="faq-grupo" aria-labelledby="perguntas-guia-t">
          <h2 id="perguntas-guia-t">{e.perguntasDoGuia}</h2>
          {perguntas.map((f) => (
            <div key={f.id} className="faq-item">
              <h3>
                <Link href={`/${lang}/ajuda#${f.id}`}>{f.pergunta}</Link>
              </h3>
              <p className="curta">{f.respostaCurta}</p>
            </div>
          ))}
        </section>
      )}
    </PaginaEditorial>
  )
}
