import Link from 'next/link'
import EmptyState from '@/components/EmptyState'
import { faceByUid } from '@/lib/domain/expression'
import type { Dictionary } from '@/lib/i18n'
import { stateType } from '@/lib/social/load'
import type { ErrorCode } from '@/lib/types'

/** The error state, of "no permission" and of "does not exist" of any social screen: a rover that reacts to what happened. */
export default function ErrorState({ codigo: code, d, lang, noBack = false }: { codigo: ErrorCode; d: Dictionary; lang: string; noBack?: boolean }) {
  const t = stateType(code)
  const m = d.socComum.erros[t]
  const state = t === 'fora-do-ar' ? 'pensar' : t === 'sem-permissao' || t === 'privado' ? 'parado' : t === 'removido' ? 'dormir' : 'pensar'
  return (
    <EmptyState
      titulo={m.titulo}
      texto={m.texto}
      ficha={faceByUid(`rvr_erro_${t}_0000000000000`)}
      estado={state}
      erro={t === 'fora-do-ar' || t === 'outro'}
      acoes={
        noBack ? undefined : (
          <Link href={`/${lang}`} className="btn btn-secondary">
            {d.comum.irParaLinha}
          </Link>
        )
      }
    />
  )
}
