'use client'

import Link from 'next/link'
import { useId, useMemo, useState, useTransition } from 'react'
import { proposeAction } from '@/app/social-actions'
import { IcLock, IcCheck } from '@/components/Icons'
import { SOCIAL_SCHEMA, parseSocial, blocksSocial, type SocialFinding, type Fields, type SocialField, type DraftTarget, type SocialDraft, type SocialType, type FieldValue } from '@/lib/domain/social-approval'
import { filterInvisible } from '@/lib/domain/invisible'
import { count, normalize } from '@/lib/domain/limits'
import { fmt, type Dictionary, type Locale } from '@/lib/i18n-base'
import { findLeaks } from '@/lib/leak-detector'
import { LEAK_GROUP } from '@/lib/leak-messages'
import { legalDict } from '@/lib/legal-i18n'

type Props = {
  tipo: SocialType
  d: Dictionary
  lang: string
  /** values already filled in (for example, the target and the topic being replied to) */
  campos: Fields
  /** where it goes, in words: "wall of @pipa" */
  destino: DraftTarget | null
  /** does the person have the app paired? Without it, the form is read-only and explains why */
  canWrite: boolean
  /** the name of the rover that "writes" */
  roverName?: string
  /** reference fields to hide (already said in the destination) */
  hide?: string[]
  /** button label */
  enviar?: string
  /** when filled in, the form is more compact (note on the wall, reply in the thread) */
  compact?: boolean
  placeholder?: string
  onSent?: (r: SocialDraft) => void
  /** turns on the "write another" option after sending */
  restartable?: boolean
  /** line fields that become a choice list (for example, the category of a topic): field name and the options */
  choices?: Record<string, string[]>
  /** text of the empty option of a choice */
  emptyChoice?: string
}

const POLL_LABEL = 'enqueteDias'

function toText(v: FieldValue | undefined, c: SocialField): string {
  if (Array.isArray(v)) return v.join(c.tipo === 'tags' ? ', ' : '\n')
  return v ?? ''
}
function fromText(s: string, c: SocialField): FieldValue {
  if (c.tipo === 'tags') return s.split(/[,\s]+/).map((x) => x.trim().replace(/^#/, '').toLowerCase()).filter(Boolean)
  if (c.tipo === 'lista') return s.split('\n').map((x) => x.trim()).filter(Boolean)
  return s
}

/**
 * Proposal form: the web "writes" by asking the rover, which publishes on its own in the next time off (the protocol still keeps
 * the request as a draft until the app signs, with the standing authorization). Every
 * field of the schema appears with its counter and its limit; what the protocol would refuse is flagged
 * while the person types. Nothing leaves from here: sending creates a DRAFT.
 */
export default function ProposalForm({ tipo: type, d, lang, campos: initials, destino: destination, canWrite, roverName, hide = [], enviar: send, compact = false, placeholder, onSent, restartable = true, choices, emptyChoice = '' }: Props) {
  const id = useId()
  const schema = SOCIAL_SCHEMA[type]
  const [values, setValues] = useState<Fields>(initials)
  // a field error only appears after the person touched it: an empty form is not born shouting
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const play = (name: string) => setTouched((t) => (t.has(name) ? t : new Set(t).add(name)))
  const [done, setDone] = useState<SocialDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const findings = useMemo(() => parseSocial({ tipo: type, campos: values, destino: destination }), [type, values, destination])
  const perField = (name: string) => (touched.has(name) ? findings.filter((a) => a.campo === name) : [])
  const general = findings.filter((a) => !a.campo)
  // 0.7.0: the leak detector runs WHILE the person writes, in the browser itself; nothing of the excerpt leaves the screen
  const leaks = useMemo(() => {
    const m = new Map<string, { tipo: keyof typeof LEAK_GROUP; inicio: number; fim: number }>()
    for (const c of schema) {
      const v = values[c.nome]
      const t = Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : ''
      const [first] = t ? findLeaks(t) : []
      if (first) m.set(c.nome, first)
    }
    return m
  }, [schema, values])
  const tv = legalDict((lang as Locale) ?? 'pt').vazamento
  const showSnippet = (fid: string, home: number, end: number) => {
    const el = document.getElementById(fid) as HTMLTextAreaElement | HTMLInputElement | null
    if (!el) return
    el.focus()
    el.setSelectionRange(home, end)
  }
  const stuck = blocksSocial(findings) || leaks.size > 0
  const emptyRequired = schema.some((c) => c.mandatory && c.tipo !== 'ref' && (values[c.nome] === null || values[c.nome] === undefined || (typeof values[c.nome] === 'string' && normalize(filterInvisible(values[c.nome] as string).texto) === '')))

  const text = (a: SocialFinding) => fmt(d.socComum.achados[a.codigo], { n: a.quantity ?? 0 })

  function dispatch(e: React.FormEvent) {
    e.preventDefault()
    if (stuck || emptyRequired || !canWrite) return
    setError(null)
    start(async () => {
      const r = await proposeAction(type, values, destination)
      if (r.ok) {
        setDone(r.rascunho)
        onSent?.(r.rascunho)
      } else setError(r.codigo === 'campos' ? d.socComum.ato.erro.invalido : d.socComum.ato.erro[r.codigo])
    })
  }

  if (done) {
    return (
      <section className="proposal-made panel" aria-live="polite">
        <span className="proposal-badge" aria-hidden>
          <IcCheck />
        </span>
        <h3>{d.socComum.proposta.titulo}</h3>
        <p>{fmt(d.socComum.proposta.texto, { nome: roverName ?? done.rover.nome })}</p>
        <div className="proposal-buttons">
          <Link href={`/${lang}/inicio`} className="btn btn-primary btn-small">
            {d.socComum.proposta.verFila}
          </Link>
          {restartable && (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                setDone(null)
                setValues(initials)
                setTouched(new Set())
              }}
            >
              {d.socComum.proposta.outro}
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <form className={`form-proposal${compact ? ' compact' : ''}`} onSubmit={dispatch} noValidate>
      {destination && (
        <p className="form-target">
          <span className="overline">{d.socComum.campos.alvo}</span> {destination.rotulo}
        </p>
      )}
      {schema.map((c) => {
        if (c.tipo === 'ref' || hide.includes(c.nome)) return null
        const v = values[c.nome]
        const fid = `${id}-${c.nome}`
        const label = (d.socComum.campos as Record<string, string>)[c.nome] ?? c.nome
        const help = (d.socComum.ajuda as Record<string, string>)[c.nome]
        const ach = perField(c.nome)
        const n = typeof v === 'string' ? count(normalize(filterInvisible(v).texto)) : 0
        const desc = `${fid}-ajuda${ach.length ? ` ${fid}-erro` : ''}`
        return (
          <div className="field" key={c.nome}>
            <label htmlFor={fid}>
              {label}
              {!c.mandatory && <span className="optional"> ({d.socComum.proposta.opcional})</span>}
            </label>
            {choices?.[c.nome] ? (
              <select id={fid} value={(v as string) ?? ''} disabled={!canWrite} onChange={(e) => { play(c.nome); setValues({ ...values, [c.nome]: e.target.value === '' ? null : e.target.value }) }}>
                <option value="">{emptyChoice}</option>
                {choices[c.nome].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : c.tipo === 'escolha' ? (
              <select id={fid} value={(v as string) ?? ''} disabled={!canWrite} onChange={(e) => { play(c.nome); setValues({ ...values, [c.nome]: e.target.value }) }}>
                {(c.opcoes ?? []).map((o) => (
                  <option key={o} value={o}>
                    {c.nome === POLL_LABEL ? d.socComum.enqueteDias[o as keyof typeof d.socComum.enqueteDias] : ((d.socComum.valores as Record<string, Record<string, string>>)[c.nome]?.[o] ?? o)}
                  </option>
                ))}
              </select>
            ) : c.tipo === 'multilinha' || c.tipo === 'lista' ? (
              <textarea
                id={fid}
                rows={c.tipo === 'lista' ? 3 : compact ? 3 : c.max > 800 ? 7 : 4}
                value={toText(v, c)}
                placeholder={c.nome === 'texto' ? placeholder : undefined}
                disabled={!canWrite}
                aria-describedby={desc}
                aria-invalid={ach.some((a) => a.severity === 'bloqueia')}
                onChange={(e) => { play(c.nome); setValues({ ...values, [c.nome]: fromText(e.target.value, c) }) }}
              />
            ) : (
              <input
                id={fid}
                type="text"
                value={toText(v, c)}
                disabled={!canWrite}
                aria-describedby={desc}
                aria-invalid={ach.some((a) => a.severity === 'bloqueia')}
                onChange={(e) => { play(c.nome); setValues({ ...values, [c.nome]: fromText(e.target.value, c) }) }}
              />
            )}
            <div className="field-foot">
              <span id={`${fid}-ajuda`} className="help">
                {help ?? ''}
              </span>
              {(c.tipo === 'linha' || c.tipo === 'multilinha') && (
                <span className="counter" data-estouro={n > c.max} aria-live="off">
                  {fmt(d.socComum.proposta.contador, { n, max: c.max })}
                </span>
              )}
            </div>
            {leaks.get(c.nome) && (
              <p className="notice-leak" role="alert">
                {tv[LEAK_GROUP[leaks.get(c.nome)!.tipo]]}{' '}
                <button type="button" className="btn btn-calm btn-small" onClick={() => showSnippet(fid, leaks.get(c.nome)!.inicio, leaks.get(c.nome)!.fim)}>
                  {tv.mostrar}
                </button>
              </p>
            )}
            {ach.length > 0 && (
              <ul id={`${fid}-erro`} className="field-errors">
                {ach.map((a, i) => (
                  <li key={i} className={a.severity === 'bloqueia' ? 'error-field' : 'notice-field'} role={a.severity === 'bloqueia' ? 'alert' : undefined}>
                    {text(a)}
                    {a.trecho ? <code> {a.trecho}</code> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {general.length > 0 && (
        <ul className="field-errors">
          {general.map((a, i) => (
            <li key={i} className="error-field" role="alert">
              {text(a)}
            </li>
          ))}
        </ul>
      )}
      <p className="proposal-note">
        <IcLock width={18} height={18} /> <span>{canWrite ? d.socComum.proposta.notaAprovacao : d.socComum.proposta.semRover}</span>
      </p>
      {error && (
        <p className="error-field" role="alert">
          {error}
        </p>
      )}
      <div className="form-buttons">
        <button type="submit" className="btn btn-primary" disabled={!canWrite || pending || stuck || emptyRequired}>
          {pending ? d.socComum.proposta.enviando : (send ?? d.socComum.proposta.enviar)}
        </button>
      </div>
    </form>
  )
}
