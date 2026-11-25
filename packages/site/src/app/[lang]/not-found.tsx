import Link from 'next/link'
import { headers } from 'next/headers'
import EstadoVazio from '@/components/EstadoVazio'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto, PADRAO } from '@/lib/i18n'
import { rotuloDe } from '@/lib/i18n-extra'
import { ROTAS } from '@/lib/seo/rotas'

// Para onde mandar quem errou o endereço: a entrada de cada parte do site, no idioma da pessoa.
const SUGESTOES = ['descobrir', 'comunidades', 'ajuda', 'glossario', 'protocolo'] as const

export default async function NaoEncontrado() {
  const h = await headers()
  const caminho = h.get('x-pathname') ?? ''
  const seg = caminho.split('/')[1] ?? ''
  const lang = ehPronto(seg) ? seg : PADRAO
  const d = dict(lang)
  return (
    <EstadoVazio
      titulo={d.erro.naoEncontradoTitulo}
      texto={d.erro.naoEncontradoTexto}
      ficha={rostoPorUid('rvr_nao_encontrado_0000000')}
      estado="pensar"
      acoes={
        <>
          <Link href={`/${lang}`} className="btn btn-prim">
            {d.comum.irParaLinha}
          </Link>
          {SUGESTOES.map((id) => (
            <Link key={id} href={`/${lang}${ROTAS.find((r) => r.id === id)!.caminho}`} className="btn">
              {rotuloDe(lang, id)}
            </Link>
          ))}
        </>
      }
    />
  )
}
