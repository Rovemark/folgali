import Link from 'next/link'
import type { ReactNode } from 'react'
import { JsonLd } from '@/components/seo/JsonLd'
import type { Fonte, SecaoDeGuia } from '@/conteudo/tipos'
import { META, type Pronto } from '@/lib/i18n'
import { instDict, rotuloDe } from '@/lib/i18n-extra'
import { grafo, type JsonLd as Dados } from '@/lib/seo/jsonld'
import { ROTAS } from '@/lib/seo/rotas'
import { indexavel } from '@/lib/site'

export type ItemDeMigalha = { nome: string; href: string }

/** Migalhas: o último item é a página atual e não é link. */
export function Migalhas({ lang, itens }: { lang: Pronto; itens: readonly ItemDeMigalha[] }) {
  const e = instDict(lang).editorial
  return (
    <nav className="migalhas" aria-label={e.migalhas}>
      <ol>
        <li>
          <Link href={`/${lang}`}>{e.inicio}</Link>
        </li>
        {itens.map((m, i) => (
          <li key={m.href}>{i === itens.length - 1 ? <span aria-current="page">{m.nome}</span> : <Link href={m.href}>{m.nome}</Link>}</li>
        ))}
      </ol>
    </nav>
  )
}

export function Secoes({ secoes }: { secoes: readonly SecaoDeGuia[] }) {
  return (
    <>
      {secoes.map((s) => (
        <section key={s.titulo} className="editorial-secao">
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

/** Links "veja também" por id do registro de rotas. Id que não existe no registro é erro de programação e o teste acusa. */
export function VerTambem({ lang, ids }: { lang: Pronto; ids: readonly string[] }) {
  if (ids.length === 0) return null
  const e = instDict(lang).editorial
  return (
    <aside className="ver-tambem" aria-labelledby="ver-tambem-t">
      <h2 id="ver-tambem-t">{e.relacionados}</h2>
      <ul>
        {ids.map((id) => {
          const r = ROTAS.find((x) => x.id === id)
          if (!r) throw new Error(`"veja também" aponta para rota que não existe: ${id}`)
          return (
            <li key={id}>
              <Link href={`/${lang}${r.caminho}`}>{rotuloDe(lang, id)}</Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export function Fontes({ lang, fontes }: { lang: Pronto; fontes?: readonly Fonte[] }) {
  if (!fontes || fontes.length === 0) return null
  const e = instDict(lang).editorial
  return (
    <section className="fontes" aria-labelledby="fontes-t">
      <h2 id="fontes-t">{e.fontes}</h2>
      <ul>
        {fontes.map((f) => (
          <li key={f.url}>{f.url.startsWith('http') ? <a href={f.url} rel="noopener">{f.titulo}</a> : <Link href={f.url}>{f.titulo}</Link>}</li>
        ))}
      </ul>
    </section>
  )
}

export function DataDeAtualizacao({ lang, iso }: { lang: Pronto; iso: string }) {
  const e = instDict(lang).editorial
  const texto = new Date(`${iso}T12:00:00Z`).toLocaleDateString(META[lang].html, { dateStyle: 'long', timeZone: 'UTC' })
  return (
    <p className="atualizado">
      {e.atualizadoEm.split('{data}')[0]}
      <time dateTime={iso}>{texto}</time>
      {e.atualizadoEm.split('{data}')[1]}
    </p>
  )
}

type Props = {
  lang: Pronto
  titulo: string
  /** A resposta que vale sozinha, no topo. É o que um assistente cita. */
  respostaCurta: string
  atualizadoEm?: string
  rascunho?: boolean
  migalhas: readonly ItemDeMigalha[]
  /** Dados estruturados da página (só saem quando o site for indexável). */
  jsonld?: readonly Dados[]
  fontes?: readonly Fonte[]
  ver?: readonly string[]
  children?: ReactNode
}

export default function PaginaEditorial({ lang, titulo, respostaCurta, atualizadoEm, rascunho, migalhas, jsonld, fontes, ver = [], children }: Props) {
  const e = instDict(lang).editorial
  return (
    <article className="editorial">
      <Migalhas lang={lang} itens={migalhas} />
      <header className="titulo-pag">
        <h1>{titulo}</h1>
      </header>
      <section className="resposta-curta" aria-labelledby="resposta-curta-t">
        <h2 id="resposta-curta-t" className="sobrelinha">
          {e.respostaCurta}
        </h2>
        <p>{respostaCurta}</p>
      </section>
      {rascunho && (
        <p className="pendente-legal" role="note">
          {e.rascunhoJuridico}
        </p>
      )}
      {children}
      <Fontes lang={lang} fontes={fontes} />
      {atualizadoEm && <DataDeAtualizacao lang={lang} iso={atualizadoEm} />}
      <VerTambem lang={lang} ids={ver} />
      {indexavel() && jsonld && jsonld.length > 0 && <JsonLd dados={grafo(...jsonld)} />}
    </article>
  )
}
