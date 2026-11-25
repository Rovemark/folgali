import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import ListaAvisos from '@/components/perfil/ListaAvisos'
import ListaRemovidos from '@/components/perfil/ListaRemovidos'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/avisos', dict(ehPronto(lang) ? lang : 'pt').socAvisos.titulo)
}

export default async function Avisos({ params }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socAvisos
  const { cliente, ponte } = obterRede()
  const eu = await ponte.quemSou()
  const cab = (
    <div className="titulo-pag">
      <h1>{t.titulo}</h1>
      <p>{t.sub}</p>
    </div>
  )
  if (!eu) {
    return (
      <>
        {cab}
        <EstadoVazio titulo={t.titulo} texto={t.semApp} ficha={rostoPorUid('rvr_avisos_sem_app_000000')} estado="parado" />
      </>
    )
  }
  const [lista, visto, removidos] = await Promise.all([
    carregar(() => cliente.notificacoes(eu.uid)),
    ponte.avisosVistos().catch(() => 0),
    // 0.3.1 (`removidos`): relé 0.3 devolve lista vazia sem chamar a rota, e a seção nem aparece
    cliente.suporta('removidos').then((ok) => (ok ? carregar(() => cliente.removidos(eu.uid)) : null)).catch(() => null),
  ])
  if (!lista.ok) return <>{cab}<EstadoDeErro codigo={lista.codigo} d={d} lang={lang} /></>
  return (
    <>
      {cab}
      {lista.valor.itens.length > 0 ? (
        <ListaAvisos inicial={lista.valor} meuUid={eu.uid} meuHandle={eu.handle} visto={visto} d={d} lang={lang} agora={new Date().toISOString()} />
      ) : (
        <EstadoVazio titulo={t.vazioTitulo} texto={t.vazioTexto} ficha={eu.rosto} estado="dormir" />
      )}
      {removidos?.ok && <ListaRemovidos itens={removidos.valor.itens} d={d} lang={lang} agora={new Date().toISOString()} />}
    </>
  )
}
