'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { reportAction, type ReportState } from '@/app/actions'
import type { Dictionary, Locale } from '@/lib/i18n-base'
import { legalDict } from '@/lib/legal-i18n'
import { OUTSIDE_HOTLINES, REPORT_REASONS, needsGoodFaith, type ReportReason } from '@/lib/report'
import { IcCheck, IcShield } from './Icons'

const ABUSE = 'abuse@rovemark.co'
const SECURITY = 'security@rovemark.co'

/** Splits a text with `{marks}` and puts a node in place of each one. */
function withLinks(text: string, us: Record<string, React.ReactNode>) {
  return text.split(/(\{\w+\})/).map((p, i) => {
    const m = /^\{(\w+)\}$/.exec(p)
    return m && us[m[1]] !== undefined ? <span key={i}>{us[m[1]]}</span> : <span key={i}>{p}</span>
  })
}

/**
 * Report form (Lex, 4.5): works without an account. Sends only the target and the reason (and the good-faith statement). Name and email,
 * for whoever wants the outcome, stay in the browser: after sending, they become an email the person sends to abuse@ from their own
 * mailbox. The site keeps nothing that identifies who reported.
 */
export default function ReportForm({ alvo: target, trecho: excerpt, autor: author, d, voltar: back, lang, requestAddress = false, targetLabel }: { alvo: string; trecho?: string; autor?: string; d: Dictionary; voltar: string; lang: Locale; requestAddress?: boolean; /** what is being reported, when it is not a post (a profile photo) */ targetLabel?: string }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(reportAction, { estado: 'novo' })
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const t = legalDict(lang).denuncia
  const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>
  if (state.estado === 'ok') {
    const subject = encodeURIComponent(`${t.titulo}: ${target || ''}`.trim())
    const body = encodeURIComponent([target, reason ? t.motivos[reason] : '', name].filter(Boolean).join('\n'))
    return (
      <section className="panel published" role="status">
        <span className="anonymous-note" style={{ borderRadius: 999, padding: 14 }}>
          <IcCheck />
        </span>
        <h2>{d.denuncia.recebidaTitulo}</h2>
        <p>{d.denuncia.recebidaTexto}</p>
        {email.includes('@') && (
          <p>
            <a className="btn btn-secondary" href={`mailto:${ABUSE}?subject=${subject}&body=${body}`}>{t.receberResultado}</a>
          </p>
        )}
        <Link href={back} className="btn btn-primary" style={{ marginTop: 8 }}>
          {d.comum.voltar}
        </Link>
      </section>
    )
  }
  const errors: Record<string, string> = { motivo: d.denuncia.erroMotivo, limite: d.denuncia.erroLimite, 'nao-achei': d.denuncia.erroNaoAcho, geral: d.denuncia.erroGeral, 'boa-fe': t.faltaBoaFe, endereco: d.denuncia.erroNaoAcho }
  const errorMessage = state.estado === 'erro' ? errors[state.erro] : null
  return (
    <form action={action} className="panel" aria-describedby="den-intro">
      <p id="den-intro" style={{ color: 'var(--tinta-2)' }}>{t.intro}</p>
      {requestAddress ? (
        <div className="report-fields">
          <label>
            {d.denuncia.alvo}
            <input type="url" name="alvo" required placeholder="https://folgali.com/pt/p/ob_..." inputMode="url" autoComplete="off" />
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="alvo" value={target} />
          <div className="target-report">
            <span className="overline">{targetLabel ?? d.denuncia.alvo}</span>
            {author && <strong>{author}</strong>}
            {excerpt && <q>{excerpt}</q>}
          </div>
        </>
      )}
      <fieldset>
        <legend>{d.denuncia.motivo}</legend>
        {REPORT_REASONS.map((m) => (
          <label key={m} className="option">
            <input type="radio" name="motivo" value={m} required onChange={() => setReason(m)} />
            <span>
              <strong>{t.motivos[m]}</strong>
            </span>
          </label>
        ))}
      </fieldset>
      {reason === 'menores' && (
        <p className="report-minors" role="note">
          {withLinks(t.menoresAviso, {
            safernet: <a href={OUTSIDE_HOTLINES.safernet} rel="noopener">SaferNet</a>,
            ncmec: <a href={OUTSIDE_HOTLINES.ncmec} rel="noopener">NCMEC</a>,
          })}
        </p>
      )}
      {/* name and e-mail stay in the browser: without `name`, they do not travel in the form */}
      <div className="report-fields">
        <label>
          {t.nome}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
        </label>
        <label>
          {t.email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" />
        </label>
      </div>
      <label className="consent-box">
        <input type="checkbox" name="boaFe" value="sim" required={reason !== null && needsGoodFaith(reason)} />
        <span>{t.boaFe}</span>
      </label>
      <div className="anonymous-note">
        <IcShield />
        <span>
          {d.denuncia.anonimaTitulo} <span style={{ fontWeight: 400 }}>{d.denuncia.anonimaTexto}</span>
        </span>
      </div>
      <p className="fine">{withLinks(t.contatos, { abuse: mail(ABUSE), seguranca: mail(SECURITY) })}</p>
      {errorMessage && <p className="error-field" role="alert">{errorMessage}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {t.enviar}
        </button>
        <Link href={back} className="btn btn-calm">
          {d.comum.cancelar}
        </Link>
      </div>
    </form>
  )
}

