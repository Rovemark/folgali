import Link from 'next/link'
import { JsonLd } from '@/components/seo/JsonLd'
import { Fontes } from './PaginaEditorial'
import { GRUPOS_DE_FAQ } from '@/conteudo/obrigatorios'
import { conteudoDe, type Faq } from '@/conteudo'
import { dict, META, type Pronto } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { faq as jsonFaq, grafo, conjuntoDeTermos } from '@/lib/seo/jsonld'
import { ENTIDADE, indexavel, urlBase } from '@/lib/site'

type A = { lang: Pronto }

/** Hub de ajuda: cada pergunta com a resposta curta e o detalhe, tudo visível. O FAQPage sai igual ao texto da página. */
export function ExtraAjuda({ lang }: A) {
  const itens = conteudoDe(lang).faq
  const t = instDict(lang).paginas.ajuda
  const grupos = t.grupos as Record<string, string>
  const ordem = [...GRUPOS_DE_FAQ, ...new Set(itens.map((f) => f.grupo))].filter((g, i, a) => a.indexOf(g) === i)
  const por = (g: string): Faq[] => itens.filter((f) => f.grupo === g)
  return (
    <>
      <p>{t.intro}</p>
      {ordem
        .filter((g) => por(g).length > 0)
        .map((g) => (
          <section key={g} className="faq-grupo" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`}>{grupos[g] ?? g}</h2>
            {por(g).map((f) => (
              <div key={f.id} id={f.id} className="faq-item">
                <h3>{f.pergunta}</h3>
                <p className="curta">{f.respostaCurta}</p>
                <p className="detalhe">{f.resposta}</p>
                <Fontes lang={lang} fontes={f.fontes} />
              </div>
            ))}
          </section>
        ))}
      {indexavel() && itens.length > 0 && <JsonLd dados={grafo(jsonFaq(itens))} />}
    </>
  )
}

export function ExtraGlossario({ lang }: A) {
  const t = instDict(lang).paginas.glossario
  const verbetes = [...conteudoDe(lang).verbetes].sort((a, b) => a.termo.localeCompare(b.termo, META[lang].html))
  const e = instDict(lang).editorial
  const base = urlBase()
  return (
    <>
      <p>{t.intro}</p>
      {verbetes.length === 0 ? (
        <p>{e.semResultados}</p>
      ) : (
        <ul className="lista-editorial">
          {verbetes.map((v) => (
            <li key={v.slug} id={v.slug}>
              <Link href={`/${lang}/glossario/${v.slug}`}>{v.termo}</Link>
              <p>{v.definicaoCurta}</p>
            </li>
          ))}
        </ul>
      )}
      {indexavel() && verbetes.length > 0 && <JsonLd dados={grafo(conjuntoDeTermos(base, lang, instDict(lang).meta.glossario.titulo, instDict(lang).meta.glossario.descricao, verbetes))} />}
    </>
  )
}

export function ExtraGuias({ lang }: A) {
  const t = instDict(lang).paginas.guias
  const guias = conteudoDe(lang).guias
  const e = instDict(lang).editorial
  return (
    <>
      <p>{t.intro}</p>
      {guias.length === 0 ? (
        <p>{e.semResultados}</p>
      ) : (
        <ul className="lista-editorial">
          {guias.map((g) => (
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

export function ExtraNovidades({ lang }: A) {
  const t = instDict(lang).paginas.novidades
  const itens = [...conteudoDe(lang).novidades].sort((a, b) => (a.data < b.data ? 1 : -1))
  return (
    <>
      <p>
        {t.intro} <a href={`/${lang}/rss.xml`}>{t.rss}</a>.
      </p>
      <ul className="lista-editorial">
        {itens.map((n) => (
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

/** A tabela de rotas da API, do texto de `institucional.<idioma>.json`. */
export function ExtraApi({ lang }: A) {
  const t = instDict(lang).paginas.api
  return (
    <>
      <p>{t.introducao}</p>
      {t.grupos.map((g) => (
        <section key={g.titulo} className="api-grupo">
          <h2>{g.titulo}</h2>
          <table className="tabela-api">
            <thead>
              <tr>
                <th scope="col">{t.colunas[0]}</th>
                <th scope="col">{t.colunas[1]}</th>
              </tr>
            </thead>
            <tbody>
              {g.rotas.map(([rota, texto]) => (
                <tr key={rota}>
                  <td>{rota}</td>
                  <td>{texto}</td>
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

/** O estado do relé, lido na hora. Nunca derruba a página: se o relé não responde, a página diz isso. */
export async function ExtraStatus({ lang }: A) {
  const t = instDict(lang).paginas.status
  const r = t.rotulos
  const { cliente } = obterRede()
  const info = await carregar(() => cliente.info())
  return (
    <>
      <dl className="estado-lista">
        <dt>{r.modo}</dt>
        <dd>{cliente.modo === 'falso' ? r.modoFalso : r.modoHttp}</dd>
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

/** As regras da casa, as mesmas do dicionário que a página Sobre e a coluna ao lado usam. */
export function ExtraRegras({ lang }: A) {
  const regras = dict(lang).linha.regras
  return (
    <ol className="regras">
      {regras.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ol>
  )
}

export function ExtraLicenca({ lang }: A) {
  const rotulo = (instDict(lang).paginas.licenca as { linkLicenca: string }).linkLicenca
  return (
    <p>
      <a href={ENTIDADE.urlLicenca} rel="noopener">
        {rotulo}
      </a>
    </p>
  )
}
