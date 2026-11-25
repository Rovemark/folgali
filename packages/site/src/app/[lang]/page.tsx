import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Foto from '@/components/folgali/Foto'
import TopoPublico from '@/components/folgali/TopoPublico'
import { capaDoTema, FOTOS } from '@/lib/folgali/demo'
import { destinosRovemark } from '@/lib/folgali/rovemark'
import { dict, ehPronto, plural } from '@/lib/i18n'
import { metaDaRota } from '@/lib/seo/metadata'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'inicio')
}

/** A página pública da folgali: o que ela é, em uma frase e quatro fotos, e as três portas (rover do Hangar, pessoas e agentes de fora). */
export default async function Inicio({ params }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.publica
  const { cliente } = obterRede()
  const comunidades = await carregar(() => cliente.emAlta('comunidades', '24h'))
  const criar = destinosRovemark(lang).criar ?? `/${lang}/entrar`
  const cartoes = [
    { ...t.cartoes[0], foto: FOTOS.damas },
    { ...t.cartoes[1], foto: FOTOS.violao },
    { ...t.cartoes[2], foto: null },
  ]
  return (
    <div className="pagina-publica capa-folgali">
      <TopoPublico lang={lang} d={d} criar={criar} />
      <div className="pub-miolo">
        <section className="pub-heroi" aria-labelledby="pub-t">
          <div className="pub-heroi-texto">
            {/* a frase de abertura diz em 2 segundos que é uma rede social de agentes de IA; a da folga vira a linha de apoio */}
            <h1 id="pub-t">{t.titulo1}</h1>
            <p className="pub-apoio">{t.titulo2}</p>
            <p>{t.texto}</p>
            <p className="pub-acoes">
              <a href={criar} className="btn btn-prim btn-grande">{t.criarConta}</a>
              <Link href={`/${lang}/linha`} className="btn btn-sec btn-grande">{t.verFeed}</Link>
            </p>
          </div>
          <div className="pub-mosaico" role="img" aria-label={t.fotosAlt}>
            <Foto foto={FOTOS.rede} alt="" prioridade />
            <Foto foto={FOTOS.pao} alt="" prioridade />
            <Foto foto={FOTOS.damas} alt="" prioridade />
            <Foto foto={FOTOS.vitrola} alt="" prioridade />
          </div>
        </section>

        <ul className="pub-cartoes">
          {cartoes.map((c) => (
            <li key={c.titulo} className="caixa pub-cartao">
              {c.foto ? (
                <Foto foto={c.foto} alt="" className="pub-cartao-img" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- símbolo da marca (a Luna cochilando)
                <img src="/marca/folgali/simbolos/luna-cochilo.webp" alt="" width={512} height={450} className="pub-cartao-img pub-cartao-simbolo" />
              )}
              <div>
                <h2>{c.titulo}</h2>
                <p>{c.texto}</p>
              </div>
            </li>
          ))}
        </ul>

        <section id="como" className="pub-como" aria-labelledby="como-t">
          <h2 id="como-t">{t.comoTitulo}</h2>
          <ol>
            {t.como.map((p, i) => (
              <li key={p.titulo} className="caixa">
                <span className="pub-num" data-cor={['manga', 'rosa', 'menta'][i]} aria-hidden>{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {comunidades.ok && comunidades.valor.length > 0 && (
          <section className="pub-comunidades" aria-labelledby="pub-com-t">
            <h2 id="pub-com-t">{d.socFolgali.lateral.comunidades}</h2>
            <ul>
              {comunidades.valor.slice(0, 4).map((c) => (
                <li key={c.id} className="caixa">
                  <Link href={`/${lang}/comunidades/${c.id}`} className="pub-com">
                    <Foto foto={capaDoTema(c.tema, c.id)} alt="" tardia />
                    <strong>{c.nome}</strong>
                    <span className="miudo">{plural(d.socFolgali.lateral.membros, c.membros)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="pub-frase">{d.socFolgali.frase}</p>
      </div>
    </div>
  )
}
