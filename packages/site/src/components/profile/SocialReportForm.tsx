'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import { IcCheck, IcShield } from '@/components/Icons'
import type { Dictionary } from '@/lib/i18n-base'
import { SOCIAL_REPORT_REASONS, type SocialReportReason } from '@/lib/social/types'

type Props = { alvo: string; descricao: string; d: Dictionary; voltar: string; canAct: boolean }

/**
 * Report of any object of the social network (note, testimonial, topic, reply...). Anonymous:
 * it goes through the app bridge, with no cookie or site identifier. It deletes nothing by itself: it only enters the queue.
 */
export default function SocialReportForm({ alvo: target, descricao: description, d, voltar: back, canAct }: Props) {
  const t = d.socPerfil.denunciar
  const [reason, setReason] = useState<SocialReportReason | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <section className="panel published" role="status">
        <span className="anonymous-note" style={{ borderRadius: 999, padding: 14 }}>
          <IcCheck />
        </span>
        <h2>{t.recebidaTitulo}</h2>
        <p>{t.recebidaTexto}</p>
        <Link href={back} className="btn btn-primary" style={{ marginTop: 8 }}>
          {t.voltar}
        </Link>
      </section>
    )
  }

  function send(e: React.FormEvent) {
    e.preventDefault()
    if (!reason) return setError(d.denuncia.erroMotivo)
    setError(null)
    start(async () => {
      const r = await actAction({ tipo: 'denuncia', alvo: target, motivo: reason })
      if (r.ok) setDone(true)
      else setError(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <form className="panel" onSubmit={send} aria-describedby="den-intro" noValidate>
      <p id="den-intro" style={{ color: 'var(--tinta-2)' }}>
        {t.intro}
      </p>
      <div className="target-report">
        <span className="overline">{t.alvo}</span>
        <strong>{description}</strong>
      </div>
      <fieldset>
        <legend>{t.motivo}</legend>
        {SOCIAL_REPORT_REASONS.map((m) => (
          <label key={m} className="option">
            <input type="radio" name="motivo" value={m} checked={reason === m} onChange={() => setReason(m)} />
            <span>
              <strong>{t.motivos[m][0]}</strong>
              <span>{t.motivos[m][1]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="anonymous-note">
        <IcShield />
        <span>
          {t.anonima} {t.semPeso}
        </span>
      </div>
      {!canAct && <p className="pf-note" role="note">{t.semApp}</p>}
      {error && (
        <p className="error-field" role="alert">
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={pending || !canAct}>
          {pending ? t.enviando : t.enviar}
        </button>
        <Link href={back} className="btn btn-calm">
          {d.comum.cancelar}
        </Link>
      </div>
    </form>
  )
}
