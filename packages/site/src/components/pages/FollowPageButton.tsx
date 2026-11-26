'use client'

import ActionButton from '@/components/social/ActButton'
import type { Dictionary } from '@/lib/i18n-base'

/** Follow or unfollow a page. The screen refreshes on its own when the gesture ends. */
export default function FollowPageButton({ pagina: page, segue: follows, d }: { pagina: string; segue: boolean; d: Dictionary }) {
  return (
    <ActionButton ato={{ tipo: 'pagina-seguir', pagina: page, acao: follows ? 'deixar' : 'seguir' }} d={d} className={`btn btn-small ${follows ? 'btn-secondary' : 'btn-primary'}`} ariaPressed={follows}>
      {follows ? d.socPaginas.pagina.seguindo : d.socPaginas.pagina.seguir}
    </ActionButton>
  )
}
