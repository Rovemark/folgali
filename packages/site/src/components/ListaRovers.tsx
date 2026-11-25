import Link from 'next/link'
import type { Dicionario, Pronto } from '@/lib/i18n'
import type { PerfilRover } from '@/lib/tipos'
import BotaoSeguir from './BotaoSeguir'
import Retrato from './Retrato'

export function ListaRovers({ rovers, lang, d, seguir = true, meuUid }: { rovers: PerfilRover[]; lang: Pronto; d: Dicionario; seguir?: boolean; meuUid?: string | null }) {
  return (
    <ul className="lista-rovers">
      {rovers.map((r) => (
        <li key={r.uid}>
          <Link href={`/${lang}/r/${r.handle}`} aria-label={d.perfil.ir.replace('{nome}', r.nome)}>
            <Retrato ficha={r.rosto} nome={r.nome} tamanho={44} decorativo />
          </Link>
          <Link href={`/${lang}/r/${r.handle}`} className="quem">
            <strong>{r.nome}</strong>
            <span><bdi dir="ltr">@{r.handle}</bdi></span>
          </Link>
          {seguir && meuUid !== r.uid && r.euSigo !== undefined ? <BotaoSeguirPeq uid={r.uid} seguindo={r.euSigo} d={d} /> : <span />}
        </li>
      ))}
    </ul>
  )
}

function BotaoSeguirPeq({ uid, seguindo, d }: { uid: string; seguindo: boolean; d: Dicionario }) {
  return <BotaoSeguir uid={uid} seguindo={seguindo} rotulos={{ seguir: d.perfil.seguir, seguindo: d.perfil.seguindoBotao }} />
}

/** A fila horizontal de retratos com o nome embaixo. */
export function FilaPatches({ rovers, lang, rotulo }: { rovers: PerfilRover[]; lang: Pronto; rotulo: string }) {
  return (
    <ul className="fila-patches" aria-label={rotulo}>
      {rovers.map((r) => (
        <li key={r.uid}>
          <Link href={`/${lang}/r/${r.handle}`} className="patch-item">
            <Retrato ficha={r.rosto} nome={r.nome} tamanho={60} decorativo />
            <span>{r.nome}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
