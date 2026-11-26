'use client'

import { useId, useState } from 'react'
import Reactions from '@/components/Reactions'
import { EditButton } from '@/components/edit/Editable'
import ActionButton from '@/components/social/ActButton'
import ProposalForm from '@/components/social/ProposalForm'
import { IcBalloon, IcTrash } from '@/components/Icons'
import { IcQuote, IcResolved } from '@/components/social/SocialIcons'
import type { Dictionary } from '@/lib/i18n-base'
import type { ForumReply } from '@/lib/social/types'
import ActionWithReason from './ActionWithReason'
import ReportDialog from './ReportDialog'

export type ReplyPermissions = {
  /** can reply in this topic now (member, not banned, topic not locked, or staff) */
  responder: boolean
  /** the reason, in text, when they cannot (for the screen to say) */
  replyReason?: string
  /** mark as solved: topic author or staff */
  resolver: boolean
  /** staff can remove other people's content (a moderator does not remove the owner's) */
  removeOthers: boolean
  /** it is mine */
  minha: boolean
}

/**
 * The actions of a reply, in a row: react, reply (opens the form that goes to the approval
 * queue), quote, mark what solved it, report and remove or delete. Each button only exists if the
 * permission matrix allows it; the relay repeats the check.
 */
export default function ReplyActions({ r, topico: topic, parentId, resolvedId, perm, d, lang, roverName, canWrite }: { r: ForumReply; topico: string; parentId: string; resolvedId: string | null; perm: ReplyPermissions; d: Dictionary; lang: string; roverName?: string; canWrite: boolean }) {
  const t = d.socForum.respostas
  const id = useId()
  const [form, setForm] = useState<null | 'responder' | 'citar'>(null)
  const isChild = r.em !== null
  const solved = resolvedId === r.id
  return (
    <>
      <div className="actions reply-actions" role="group" aria-label={t.fioAcoes.replace('{nome}', r.autor.nome)}>
        <Reactions id={r.id} reacoes={r.reacoes} minha={r.minhaReacao ?? null} rotulos={{ curtir: t.curtir, util: t.util }} />
        {perm.responder && (
          <button type="button" className="action-btn text" aria-expanded={form === 'responder'} aria-controls={`${id}-f`} onClick={() => setForm(form === 'responder' ? null : 'responder')}>
            <IcBalloon />
            <span>{t.responder}</span>
          </button>
        )}
        {perm.responder && !isChild && (
          <button type="button" className="action-btn text" aria-expanded={form === 'citar'} aria-controls={`${id}-f`} onClick={() => setForm(form === 'citar' ? null : 'citar')}>
            <IcQuote />
            <span>{t.citar}</span>
          </button>
        )}
        {perm.resolver && (
          <ActionButton ato={{ tipo: 'topico-resolvido', topico: topic, resposta: solved ? null : r.id }} d={d} className="action-btn text" ariaPressed={solved}>
            <IcResolved />
            <span>{solved ? t.desmarcar : t.marcar}</span>
          </ActionButton>
        )}
        {/* 0.11.0 part 2: "Edit" only on the signed-in person's own reply, when the relay takes edits */}
        <EditButton />
        {!perm.minha && <ReportDialog alvo={r.id} d={d} rotulo={t.denunciar} />}
        {perm.minha ? (
          <ActionButton ato={{ tipo: 'remocao-pelo-autor', alvo: r.id }} d={d} className="action-btn text" confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagar }}>
            <IcTrash />
            <span>{t.apagar}</span>
          </ActionButton>
        ) : (
          perm.removeOthers && (
            <ActionWithReason
              ato={{ tipo: 'remocao-por-responsavel', alvo: r.id }}
              d={d}
              rotulo={t.remover}
              titulo={d.socForum.gestao.removerTitulo}
              texto={d.socForum.gestao.removerTexto}
              confirmar={d.socForum.gestao.confirmar}
              className="action-btn text danger-text"
            />
          )
        )}
      </div>
      {!perm.responder && perm.replyReason && <p className="fine reply-notice">{perm.replyReason}</p>}
      {form && (
        <div id={`${id}-f`} className="reply-form">
          <p className="overline">{form === 'citar' ? t.citando.replace('{nome}', r.autor.nome) : isChild ? t.fundaDica : t.responderA.replace('{nome}', r.autor.nome)}</p>
          <ProposalForm
            key={form}
            tipo="resposta-forum"
            d={d}
            lang={lang}
            compact
            canWrite={canWrite}
            roverName={roverName}
            destino={null}
            hide={['topico', 'em', 'cita']}
            campos={{ topico: topic, em: form === 'citar' ? null : parentId, cita: form === 'citar' || isChild ? r.id : null, texto: '' }}
            onSent={() => undefined}
          />
        </div>
      )}
    </>
  )
}
