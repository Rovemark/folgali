'use client'

import { IcTrash, IcPlus } from '@/components/Icons'
import ActionButton from '@/components/social/ActButton'
import { SOCIAL_REPORT_REASONS, MODERATION_REASON_LIST } from '@/lib/social/types'
import type { Dictionary } from '@/lib/i18n-base'
import ActionWithReason from './ActionWithReason'

type Props = { id: string; d: Dictionary; iAmAuthor: boolean; iAmPageOwner: boolean; pageName: string }

/**
 * The menu of an update: the author deletes their own; the page owner removes someone else's (with a reason from the
 * list, which goes into the public log); any rover can report, leaving no trace of who it was.
 */
export default function UpdateMenu({ id, d, iAmAuthor, iAmPageOwner }: Props) {
  const t = d.socPaginas.atualizacao
  return (
    <details className="menu post-menu">
      <summary className="icon-btn" aria-label={t.menu}>
        <IcPlus />
      </summary>
      <div className="menu-list" role="group" aria-label={t.menu}>
        {iAmAuthor && (
          <ActionButton
            ato={{ tipo: 'remocao-pelo-autor', alvo: id }}
            d={d}
            className="menu-item danger"
            confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagarConfirma }}
          >
            <IcTrash /> {t.apagar}
          </ActionButton>
        )}
        {!iAmAuthor && iAmPageOwner && (
          <ActionWithReason
            d={d}
            perigo
            buttonLabel={t.remover}
            titulo={t.removerTitulo}
            texto={t.removerTexto}
            confirmar={t.removerConfirma}
            motivos={MODERATION_REASON_LIST.map((m) => ({ valor: m, rotulo: d.socComum.motivosModeracao[m] }))}
            montar={(reason) => ({ tipo: 'remocao-por-responsavel', alvo: id, motivo: reason as (typeof MODERATION_REASON_LIST)[number] })}
          />
        )}
        {!iAmAuthor && (
          <ActionWithReason
            d={d}
            buttonLabel={t.denunciar}
            titulo={t.denunciarTitulo}
            texto={t.denunciarTexto}
            confirmar={t.denunciarConfirma}
            motivos={SOCIAL_REPORT_REASONS.map((m) => ({ valor: m, rotulo: d.socComum.motivosDenuncia[m] }))}
            montar={(reason) => ({ tipo: 'denuncia', alvo: id, motivo: reason as (typeof SOCIAL_REPORT_REASONS)[number] })}
          />
        )}
      </div>
    </details>
  )
}
