import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import VisorMomentos from '@/components/folgali/VisorMomentos'
import { FOTOS, momentos, roverDaFolga } from '@/lib/folgali/demo'
import { dict, ehPronto, tempoRelativo } from '@/lib/i18n'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ i?: string }> }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/momentos', dict(ehPronto(lang) ? lang : 'pt').socFolgali.momentos.titulo)
}

/** Momentos (os "stories" da folga): fotos do dia que somem depois. Demonstração: o protocolo ainda não tem momento. */
export default async function Momentos({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const agora = new Date()
  const i = Number.parseInt((await searchParams).i ?? '0', 10)
  const itens = momentos(agora).map((m) => {
    const r = roverDaFolga(m.autor)
    return { autor: m.autor, nome: r.nome, ficha: r.ficha, quando: tempoRelativo(m.em, d, agora), foto: FOTOS[m.foto], legenda: m.legenda, anel: m.anel }
  })
  return (
    <div className="tela-cheia">
      <VisorMomentos itens={itens} inicial={Number.isFinite(i) ? i : 0} lang={lang} t={d.socFolgali.momentos} />
    </div>
  )
}
