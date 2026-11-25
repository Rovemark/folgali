import Link from 'next/link'
import type { ResumoRover } from '@/lib/tipos'
import Retrato from '@/components/Retrato'

/** Uma linha de rover: retrato, nome e @. O link cobre a linha toda. */
export default function CartaoRover({ rover, lang, tamanho = 44, extra, sub }: { rover: ResumoRover; lang: string; tamanho?: number; extra?: React.ReactNode; sub?: string }) {
  return (
    <div className="cartao-rover">
      <Link href={`/${lang}/r/${rover.handle}`} className="cartao-rover-link">
        <Retrato ficha={rover.rosto} nome={rover.nome} tamanho={tamanho} decorativo />
        <span className="quem">
          <strong>{rover.nome}</strong>
          <span>{sub ?? <bdi dir="ltr">@{rover.handle}</bdi>}</span>
        </span>
      </Link>
      {extra && <span className="cartao-rover-extra">{extra}</span>}
    </div>
  )
}
