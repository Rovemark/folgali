'use client'

// Step 2 of the claim, for real (docs/INTEGRATION-ROVEMARK-VERIFIED-OWNER.md, section 5): the owner types the code the agent showed,
// ticks that she answers for the agent (Lex 4.2), and the site's server asks Rovemark for a fresh owner act and hands it to the open
// issuer (/api/agents/claim). A new act per click; nothing is kept in the browser.
import Link from 'next/link'
import { useId, useState } from 'react'
import { IcVerified } from '@/components/folgali/Icons'
import type { PersonTexts } from '@/i18n/person'

const CODE_RE = /^[A-ZÃÁÉÊÍÓÔÕÚÇ]{2,6}-\d{4}$/u
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')

export default function ClaimForm({ t, claim, nome: name, lang, box, terms, missingBox }: { t: PersonTexts; claim: string; nome: string; lang: string; box: string; terms: { label: string; href: string }; missingBox: string }) {
  const id = useId()
  const [code, setCode] = useState('')
  const [responsible, setResponsible] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ handle: string | null; nome: string } | null>(null)
  const normal = code.normalize('NFC').trim().toUpperCase()

  async function release(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!responsible || !CODE_RE.test(normal) || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/agents/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claim, code: normal, responsible: true }), credentials: 'same-origin' })
      const j = (await r.json().catch(() => ({}))) as { handle?: string | null; nome?: string; erro?: { codigo?: string } }
      if (!r.ok) {
        const c = j.erro?.codigo ?? ''
        setError((t.claimErrors as Record<string, string>)[c] ?? (c === 'reivindicacao_invalida' ? t.claimInvalid : c === 'sem_sessao' ? t.errors.signed_out : t.errors.generic))
        return
      }
      setDone({ handle: j.handle ?? null, nome: j.nome ?? name })
    } catch {
      setError(t.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="callout callout-ok unlocked" role="status">
        <p className="unlocked-t"><IcVerified /> {fill(t.claimReleased, { nome: done.nome })}</p>
        {done.handle && <Link href={`/${lang}/r/${done.handle}`} className="btn btn-primary btn-small">{t.openProfile}</Link>}
      </div>
    )
  }
  const [before, after = ''] = box.split('{termos}')
  return (
    <form className="claim-form" onSubmit={release}>
      <div className="field">
        <label htmlFor={`${id}-c`}>{t.claimCode}</label>
        <input id={`${id}-c`} type="text" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" spellCheck={false} maxLength={12} aria-describedby={`${id}-ch`} />
        <span id={`${id}-ch`} className="help">{t.claimCodeHelp}</span>
      </div>
      <label className="consent-box">
        <input type="checkbox" checked={responsible} onChange={(e) => setResponsible(e.target.checked)} />
        <span>
          {before}
          <Link href={terms.href}>{terms.label}</Link>
          {after}
        </span>
      </label>
      {tried && !responsible && <p className="consent-error" role="alert">{missingBox}</p>}
      {error && <p className="callout callout-notice" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-large btn-wide" disabled={busy || !CODE_RE.test(normal)} aria-busy={busy}>
        {busy ? t.claimReleasing : t.claimRelease}
      </button>
    </form>
  )
}
