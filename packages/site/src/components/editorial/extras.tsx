import Link from 'next/link'
import { JsonLd } from '@/components/seo/JsonLd'
import { Sources } from './EditorialPage'
import { FAQ_GROUPS } from '@/content/required'
import { contentOf, type Faq } from '@/content'
import { dict, META, type Ready } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { faq as jsonFaq, graph, termSet } from '@/lib/seo/jsonld'
import { ENTITY, indexable, urlBase } from '@/lib/site'

type A = { lang: Ready }

/** Help hub: each question with the short answer and the detail, all visible. The FAQPage comes out equal to the text of the page. */
export function ExtraHelp({ lang }: A) {
  const items = contentOf(lang).faq
  const t = instDict(lang).paginas.ajuda
  const groups = t.grupos as Record<string, string>
  const order = [...FAQ_GROUPS, ...new Set(items.map((f) => f.grupo))].filter((g, i, a) => a.indexOf(g) === i)
  const by = (g: string): Faq[] => items.filter((f) => f.grupo === g)
  return (
    <>
      <p>{t.intro}</p>
      {order
        .filter((g) => by(g).length > 0)
        .map((g) => (
          <section key={g} className="faq-group" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`}>{groups[g] ?? g}</h2>
            {by(g).map((f) => (
              <div key={f.id} id={f.id} className="faq-item">
                <h3>{f.pergunta}</h3>
                <p className="brief">{f.respostaCurta}</p>
                <p className="detail">{f.resposta}</p>
                <Sources lang={lang} fontes={f.fontes} />
              </div>
            ))}
          </section>
        ))}
      {indexable() && items.length > 0 && <JsonLd dados={graph(jsonFaq(items))} />}
    </>
  )
}

export function ExtraGlossary({ lang }: A) {
  const t = instDict(lang).paginas.glossario
  const glossaryEntries = [...contentOf(lang).verbetes].sort((a, b) => a.termo.localeCompare(b.termo, META[lang].html))
  const e = instDict(lang).editorial
  const base = urlBase()
  return (
    <>
      <p>{t.intro}</p>
      {glossaryEntries.length === 0 ? (
        <p>{e.semResultados}</p>
      ) : (
        <ul className="editorial-list">
          {glossaryEntries.map((v) => (
            <li key={v.slug} id={v.slug}>
              <Link href={`/${lang}/glossario/${v.slug}`}>{v.termo}</Link>
              <p>{v.definicaoCurta}</p>
            </li>
          ))}
        </ul>
      )}
      {indexable() && glossaryEntries.length > 0 && <JsonLd dados={graph(termSet(base, lang, instDict(lang).meta.glossario.titulo, instDict(lang).meta.glossario.descricao, glossaryEntries))} />}
    </>
  )
}

export function ExtraGuides({ lang }: A) {
  const t = instDict(lang).paginas.guias
  const guides = contentOf(lang).guias
  const e = instDict(lang).editorial
  return (
    <>
      <p>{t.intro}</p>
      {guides.length === 0 ? (
        <p>{e.semResultados}</p>
      ) : (
        <ul className="editorial-list">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link href={`/${lang}/guias/${g.slug}`}>{g.titulo}</Link>
              <p>{g.respostaCurta}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function ExtraNews({ lang }: A) {
  const t = instDict(lang).paginas.novidades
  const items = [...contentOf(lang).novidades].sort((a, b) => (a.data < b.data ? 1 : -1))
  return (
    <>
      <p>
        {t.intro} <a href={`/${lang}/rss.xml`}>{t.rss}</a>.
      </p>
      <ul className="editorial-list">
        {items.map((n) => (
          <li key={n.id} id={n.id}>
            <time dateTime={n.data}>{n.data}</time>
            <strong>{n.titulo}</strong>
            <p>{n.resumo}</p>
            {n.itens && n.itens.length > 0 && (
              <ul>
                {n.itens.map((i) => (
                  <li key={i} style={{ border: 0, padding: 0 }}>
                    {i}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/** The table of API routes, from the text of `institutional.<language>.json`. */
export function ExtraApi({ lang }: A) {
  const t = instDict(lang).paginas.api
  return (
    <>
      <p>{t.introducao}</p>
      {t.grupos.map((g) => (
        <section key={g.titulo} className="api-group">
          <h2>{g.titulo}</h2>
          <table className="api-table">
            <thead>
              <tr>
                <th scope="col">{t.colunas[0]}</th>
                <th scope="col">{t.colunas[1]}</th>
              </tr>
            </thead>
            <tbody>
              {g.rotas.map(([route, text]) => (
                <tr key={route}>
                  <td>{route}</td>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p>{t.nota}</p>
    </>
  )
}

/** The state of the relay, read on the spot. It never takes the page down: if the relay does not answer, the page says so. */
export async function ExtraStatus({ lang }: A) {
  const t = instDict(lang).paginas.status
  const r = t.rotulos
  const { cliente: client } = getNetwork()
  const info = await load(() => client.info())
  return (
    <>
      <dl className="state-list">
        <dt>{r.modo}</dt>
        <dd>{client.modo === 'falso' ? r.modoFalso : r.modoHttp}</dd>
        {info.ok ? (
          <>
            <dt>{r.protocolos}</dt>
            <dd>{info.valor.protocolo.join(', ')}</dd>
            <dt>{r.recursos}</dt>
            <dd>{info.valor.recursos.length > 0 ? info.valor.recursos.join(', ') : '0'}</dd>
          </>
        ) : (
          <>
            <dt />
            <dd>{r.indisponivel}</dd>
          </>
        )}
      </dl>
      <p>{t.nota}</p>
    </>
  )
}

/** The house rules, the same as the dictionary that the About page and the column beside it use. */
export function ExtraRules({ lang }: A) {
  const rules = dict(lang).linha.regras
  return (
    <ol className="rules">
      {rules.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ol>
  )
}

export function ExtraLicense({ lang }: A) {
  const label = (instDict(lang).paginas.licenca as { linkLicenca: string }).linkLicenca
  return (
    <p>
      <a href={ENTITY.licenseUrl} rel="noopener">
        {label}
      </a>
    </p>
  )
}
