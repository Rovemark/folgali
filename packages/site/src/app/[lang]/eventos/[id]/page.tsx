import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Retrato from '@/components/Retrato'
import BotoesEvento from '@/components/folgali/BotoesEvento'
import Foto from '@/components/folgali/Foto'
import { IcGrupo } from '@/components/folgali/Icones'
import { horaDoEvento, seloDoDia } from '@/lib/folgali/datas'
import { FOTOS, evento, roverDaFolga } from '@/lib/folgali/demo'
import { dict, ehPronto, fmt, plural } from '@/lib/i18n'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  const e = evento(id, new Date())
  return metaTela(lang, `/eventos/${id}`, e?.titulo ?? dict(ehPronto(lang) ? lang : 'pt').socFolgali.eventos.titulo)
}

/** O evento aberto: capa, data, quem organiza, quem vai e a conversa do evento. Demonstração. */
export default async function EventoAberto({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const agora = new Date()
  const e = evento(id, agora)
  if (!e) notFound()
  const d = dict(lang)
  const t = d.socFolgali.eventos
  const org = roverDaFolga(e.organizador)
  return (
    <div className="pagina-larga ev-aberto">
      <section className="caixa ev-capa" aria-labelledby="ev-t">
        <div className="ev-capa-foto">
          <Foto foto={FOTOS[e.foto]} prioridade tamanhos="(min-width: 960px) 900px, 100vw" />
        </div>
        <div className="ev-capa-info">
          <p className="ev-data">{seloDoDia(e.em, lang)} · {horaDoEvento(e.em, lang)}</p>
          <div className="ev-capa-texto">
            <h1 id="ev-t">{e.titulo}</h1>
            <p className="ev-meta"><IcGrupo /> {e.comunidade} · {plural(t.vao, e.vao)} · {plural(t.talvezN, e.talvez)}</p>
          </div>
          <BotoesEvento vou={t.vou} talvez={t.talvez} marcou={t.marcou} grande />
        </div>
        <nav className="abas-pag ev-abas" aria-label={e.titulo}>
          <a href="#sobre" aria-current="page">{t.sobre}</a>
          <a href="#conversa">{t.conversa}</a>
          <a href="#quem-vai">{t.quemVai}</a>
        </nav>
      </section>
      <div className="ev-colunas">
        <div className="ev-col">
          <section id="sobre" className="caixa caixa-pad" aria-labelledby="ev-sobre">
            <h2 id="ev-sobre" className="lat-titulo">{t.sobreEvento}</h2>
            <p className="ev-desc">{e.descricao}</p>
            <p className="miudo">{t.demo}</p>
          </section>
          <section id="conversa" className="caixa caixa-pad" aria-labelledby="ev-conversa">
            <h2 id="ev-conversa" className="lat-titulo">{t.conversaEvento}</h2>
            {e.conversa.length === 0 ? (
              <p className="miudo">{t.semConversa}</p>
            ) : (
              <ul className="ev-conversa">
                {e.conversa.map((c, i) => {
                  const r = roverDaFolga(c.autor)
                  return (
                    <li key={i}>
                      <Retrato ficha={r.ficha} nome={r.nome} tamanho={48} decorativo />
                      <div>
                        <Link href={`/${lang}/r/${c.autor}`} className="coment-nome">{r.nome}</Link>
                        <p dir="auto">{c.texto}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
        <div className="ev-col">
          <section id="quem-vai" className="caixa caixa-pad" aria-labelledby="ev-quem">
            <h2 id="ev-quem" className="lat-titulo">{t.quemVai}</h2>
            <ul className="ev-quem">
              {e.quemVai.map((h) => {
                const r = roverDaFolga(h)
                return (
                  <li key={h}>
                    <Link href={`/${lang}/r/${h}`} className="ev-quem-item">
                      <Retrato ficha={r.ficha} nome={r.nome} tamanho={72} decorativo />
                      <span>{r.nome}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
          <Link href={`/${lang}/r/${e.organizador}`} className="caixa ev-org">
            <Retrato ficha={org.ficha} nome={org.nome} tamanho={64} decorativo />
            <span>{fmt(t.organizado, { nome: org.nome })}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
