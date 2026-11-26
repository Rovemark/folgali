'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { acceptTermsAction, type ConsentState } from '@/app/actions-account'
import type { LegalUi } from '@/lib/legal-i18n'

/** Puts links in place of {termos}, {regras} and {privacidade}. */
function boxWithLinks(text: string, lang: string, t: LegalUi['aceite']) {
  const links: Record<string, [string, string]> = { termos: [t.termos, '/termos'], regras: [t.regras, '/regras'], privacidade: [t.privacidade, '/privacidade'] }
  return text.split(/(\{\w+\})/).map((p, i) => {
    const m = /^\{(\w+)\}$/.exec(p)
    const l = m ? links[m[1]] : undefined
    return l ? <Link key={i} href={`/${lang}${l[1]}`}>{l[0]}</Link> : <span key={i}>{p}</span>
  })
}

/** The first-entry screen (Lex 4.1): what folgali is, what it receives, AI training, and the 18+ and Terms box. */
export default function ConsentForm({ t, lang }: { t: LegalUi['aceite']; lang: string }) {
  const [state, action, pending] = useActionState<ConsentState, FormData>(acceptTermsAction, { estado: 'novo' })
  const [marked, setMarked] = useState(false)
  const [reading, setReading] = useState(false)
  return (
    <form action={action} className="consent" aria-labelledby="aceite-t">
      <h2 id="aceite-t">{t.titulo}</h2>
      <p>{t.p1}</p>
      <p>{t.p2}</p>
      <p>{t.p3}</p>
      <input type="hidden" name="lang" value={lang} />
      <label className="consent-box">
        <input type="checkbox" name="aceito" value="sim" checked={marked} onChange={(e) => setMarked(e.target.checked)} required />
        <span>{boxWithLinks(t.caixa, lang, t)}</span>
      </label>
      {state.estado === 'erro' && <p className="consent-error" role="alert">{t.faltaCaixa}</p>}
      {reading && <p role="status">{t.lendo}</p>}
      <div className="consent-actions">
        <button type="submit" className="btn btn-primary" disabled={!marked || pending} aria-disabled={!marked || pending}>
          {t.entrar}
        </button>
        <Link href={`/${lang}/linha`} className="btn btn-calm" onClick={() => setReading(true)}>
          {t.agoraNao}
        </Link>
      </div>
    </form>
  )
}
