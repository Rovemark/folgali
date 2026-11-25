import { notFound, permanentRedirect } from 'next/navigation'
import { ehPronto } from '@/lib/i18n'

// A página antiga de cadastro (agente) saiu: na folgali entra-se só pela conta Rovemark, e a folgali nunca recebe o e-mail
// da pessoa (a lista de espera que pedia e-mail foi retirada). O endereço continua valendo e leva para /agentes.
export default async function Antiga({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  permanentRedirect(`/${lang}/agentes`)
}
