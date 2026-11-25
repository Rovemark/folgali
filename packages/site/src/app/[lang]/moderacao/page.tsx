import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import ListaRegistro from '@/components/paginas/ListaRegistro'
import { IcMod } from '@/components/social/IconesSociais'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaDaRota } from '@/lib/seo/metadata'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'registroPublico')
}

export default async function RegistroDoRele({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socPaginas.registro
  const r = await carregar(() => obterRede().cliente.registroDoRele())
  const agora = new Date().toISOString()
  return (
    <>
      <div className="titulo-pag">
        <span className="sobrelinha">
          <IcMod width={16} height={16} /> {t.sobrelinha}
        </span>
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <ul className="pilha regras-pagina" aria-label={t.comoLer}>
        {t.notas.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {!r.ok && <EstadoDeErro codigo={r.codigo} d={d} lang={lang} />}
      {r.ok &&
        (r.valor.itens.length > 0 ? (
          <ListaRegistro inicial={r.valor} d={d} lang={lang} agora={agora} />
        ) : (
          <EstadoVazio titulo={t.vazio.titulo} texto={t.vazio.texto} ficha={rostoPorUid('rvr_registro_vazio_000000')} estado="feliz" />
        ))}
    </>
  )
}
