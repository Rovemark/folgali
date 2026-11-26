import Link from 'next/link'
import type { ReactNode } from 'react'
import { CoverOf } from '@/components/folgali/PageCover'
import { JsonLd } from '@/components/seo/JsonLd'
import type { Source, GuideSection } from '@/content/types'
import { META, type Ready } from '@/lib/i18n'
import { instDict, labelOf } from '@/lib/i18n-extra'
import { graph, type JsonLd as Data } from '@/lib/seo/jsonld'
import { ROUTES } from '@/lib/seo/routes'
import { indexable } from '@/lib/site'

export type BreadcrumbItem = { nome: string; href: string }

/** Breadcrumbs: the last item is the current page and is not a link. */
export function Breadcrumbs({ lang, itens: items }: { lang: Ready; itens: readonly BreadcrumbItem[] }) {
  const e = instDict(lang).editorial
  return (
    <nav className="breadcrumbs" aria-label={e.migalhas}>
      <ol>
        <li>
          <Link href={`/${lang}`}>{e.inicio}</Link>
        </li>
        {items.map((m, i) => (
          <li key={m.href}>{i === items.length - 1 ? <span aria-current="page">{m.nome}</span> : <Link href={m.href}>{m.nome}</Link>}</li>
        ))}
      </ol>
    </nav>
  )
}

export function Sections({ secoes: sections }: { secoes: readonly GuideSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.titulo} className="editorial-section">
          <h2>{s.titulo}</h2>
          {s.paragrafos.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.lista && s.lista.length > 0 && (
            <ul>
              {s.lista.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {s.codigo && (
            <pre>
              <code lang={s.codigo.linguagem}>{s.codigo.texto}</code>
            </pre>
          )}
        </section>
      ))}
    </>
  )
}

/** "See also" links by id of the route registry. An id that does not exist in the registry is a programming error and the test catches it. */
export function SeeAlso({ lang, ids }: { lang: Ready; ids: readonly string[] }) {
  if (ids.length === 0) return null
  const e = instDict(lang).editorial
  return (
    <aside className="see-also" aria-labelledby="ver-tambem-t">
      <h2 id="ver-tambem-t">{e.relacionados}</h2>
      <ul>
        {ids.map((id) => {
          const r = ROUTES.find((x) => x.id === id)
          if (!r) throw new Error(`"veja também" aponta para rota que não existe: ${id}`)
          return (
            <li key={id}>
              <Link href={`/${lang}${r.caminho}`}>{labelOf(lang, id)}</Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export function Sources({ lang, fontes: sources }: { lang: Ready; fontes?: readonly Source[] }) {
  if (!sources || sources.length === 0) return null
  const e = instDict(lang).editorial
  return (
    <section className="sources" aria-labelledby="fontes-t">
      <h2 id="fontes-t">{e.fontes}</h2>
      <ul>
        {sources.map((f) => (
          <li key={f.url}>{f.url.startsWith('http') ? <a href={f.url} rel="noopener">{f.titulo}</a> : <Link href={f.url}>{f.titulo}</Link>}</li>
        ))}
      </ul>
    </section>
  )
}

export function UpdateDate({ lang, iso }: { lang: Ready; iso: string }) {
  const e = instDict(lang).editorial
  const text = new Date(`${iso}T12:00:00Z`).toLocaleDateString(META[lang].html, { dateStyle: 'long', timeZone: 'UTC' })
  return (
    <p className="updated">
      {e.atualizadoEm.split('{data}')[0]}
      <time dateTime={iso}>{text}</time>
      {e.atualizadoEm.split('{data}')[1]}
    </p>
  )
}

type Props = {
  lang: Ready
  titulo: string
  /** The answer that stands on its own, at the top. It is what an assistant cites. */
  respostaCurta: string
  atualizadoEm?: string
  rascunho?: boolean
  migalhas: readonly BreadcrumbItem[]
  /** Structured data of the page (only emitted when the site is indexable). */
  jsonld?: readonly Data[]
  fontes?: readonly Source[]
  ver?: readonly string[]
  /** Route id whose illustrated header (src/lib/folgali/scenes.ts, PAGE_ART) opens the page, when it has one. */
  cover?: string
  children?: ReactNode
}

export default function EditorialPage({ lang, titulo: title, respostaCurta: shortReply, atualizadoEm: updatedAt, rascunho: draft, migalhas: breadcrumbs, jsonld, fontes: sources, ver: view = [], cover, children }: Props) {
  const e = instDict(lang).editorial
  return (
    <article className="editorial">
      <Breadcrumbs lang={lang} itens={breadcrumbs} />
      {cover && <CoverOf id={cover} />}
      <header className="page-title">
        <h1>{title}</h1>
      </header>
      <section className="reply-short" aria-labelledby="resposta-curta-t">
        <h2 id="resposta-curta-t" className="overline">
          {e.respostaCurta}
        </h2>
        <p>{shortReply}</p>
      </section>
      {draft && (
        <p className="pending-legal" role="note">
          {e.rascunhoJuridico}
        </p>
      )}
      {children}
      <Sources lang={lang} fontes={sources} />
      {updatedAt && <UpdateDate lang={lang} iso={updatedAt} />}
      <SeeAlso lang={lang} ids={view} />
      {indexable() && jsonld && jsonld.length > 0 && <JsonLd dados={graph(...jsonld)} />}
    </article>
  )
}
