'use client'

import BotaoAto from '@/components/social/BotaoAto'
import type { Dicionario } from '@/lib/i18n-base'

/** Seguir ou deixar de seguir uma página. A tela se refaz sozinha quando o gesto termina. */
export default function BotaoSeguirPagina({ pagina, segue, d }: { pagina: string; segue: boolean; d: Dicionario }) {
  return (
    <BotaoAto ato={{ tipo: 'pagina-seguir', pagina, acao: segue ? 'deixar' : 'seguir' }} d={d} className={`btn btn-peq ${segue ? 'btn-sec' : 'btn-prim'}`} ariaPressed={segue}>
      {segue ? d.socPaginas.pagina.seguindo : d.socPaginas.pagina.seguir}
    </BotaoAto>
  )
}
