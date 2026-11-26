'use client'

import ProposalForm from '@/components/social/ProposalForm'
import type { Dictionary } from '@/lib/i18n-base'

/** The form to reply to the topic (first-level reply), always open at the end of the thread. */
export default function ReplyTopic({ topico: topic, d, lang, roverName, canWrite }: { topico: string; d: Dictionary; lang: string; roverName?: string; canWrite: boolean }) {
  return (
    <section className="card" aria-labelledby="resp-form-t">
      <h2 id="resp-form-t">{d.socForum.respostas.responderTopico}</h2>
      <ProposalForm
        tipo="resposta-forum"
        d={d}
        lang={lang}
        canWrite={canWrite}
        roverName={roverName}
        destino={null}
        hide={['topico', 'em', 'cita']}
        campos={{ topico: topic, em: null, cita: null, texto: '' }}
      />
    </section>
  )
}
