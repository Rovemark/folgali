import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import BotoesEvento from '@/components/folgali/BotoesEvento'
import Foto from '@/components/folgali/Foto'
import { IcCalendario, IcGrupo, IcOnline, IcPin } from '@/components/folgali/Icones'
import { ehHoje, horaDoEvento, seloDoDia } from '@/lib/folgali/datas'
import { FOTOS, eventos } from '@/lib/folgali/demo'
import { dict, ehPronto, plural } from '@/lib/i18n'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ filtro?: string }> }
const FILTROS = ['semana', 'hoje', 'perto', 'online'] as const
type Filtro = (typeof FILTROS)[number]

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/eventos', dict(ehPronto(lang) ? lang : 'pt').socFolgali.eventos.titulo)
}

/** Eventos da folga: noite de jogos, feira, sarau. O protocolo ainda não tem evento: tudo aqui é da demonstração. */
export default async function Eventos({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.eventos
  const pedido = (await searchParams).filtro
  const filtro: Filtro = (FILTROS as readonly string[]).includes(pedido ?? '') ? (pedido as Filtro) : 'semana'
  const agora = new Date()
  const todos = eventos(agora)
  const lista = todos.filter((e) => (filtro === 'hoje' ? ehHoje(e.em, agora) : filtro === 'perto' ? e.perto : filtro === 'online' ? e.online : true))
  const icones = { hoje: <IcCalendario />, semana: <IcCalendario />, perto: <IcPin />, online: <IcOnline /> }
  return (
    <div className="pagina-larga eventos">
      <nav className="caixa ev-filtros" aria-labelledby="ev-filtros-t">
        <h2 id="ev-filtros-t" className="lat-titulo">{t.filtros}</h2>
        <ul>
          {(['hoje', 'semana', 'perto', 'online'] as const).map((f) => (
            <li key={f}>
              <Link href={`/${lang}/eventos${f === 'semana' ? '' : `?filtro=${f}`}`} className="ev-filtro" aria-current={filtro === f ? 'page' : undefined}>
                {icones[f]}
                <span>{t[f]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ev-principal">
        <div className="titulo-pag">
          <h1>{t.titulo}</h1>
          <p className="miudo">{t.demo}</p>
        </div>
        {lista.length === 0 ? (
          <p className="vazio">{t.vazio}</p>
        ) : (
          <ul className="ev-grade">
            {lista.map((e, i) => (
              <li key={e.id} className="caixa ev-cartao" data-largo={i >= 3 ? '1' : '0'}>
                <div className="ev-foto">
                  <Foto foto={FOTOS[e.foto]} alt="" prioridade={i < 3} />
                  <span className="ev-dia">{seloDoDia(e.em, lang)}</span>
                </div>
                <div className="ev-corpo">
                  <h2>
                    <Link href={`/${lang}/eventos/${e.id}`} className="ev-link">{e.titulo}</Link>
                  </h2>
                  <p className="ev-meta"><IcGrupo /> {e.comunidade} · {horaDoEvento(e.em, lang)}</p>
                  <p className="ev-meta"><IcGrupo /> {plural(t.vao, e.vao)}</p>
                  <BotoesEvento vou={t.vou} talvez={t.talvez} marcou={t.marcou} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
