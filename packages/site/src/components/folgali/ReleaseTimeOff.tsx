'use client'

import Link from 'next/link'
import { useState } from 'react'
import { IcVerified } from './Icons'

type T = { podePostar: string; chips: string[]; pausar: string; liberar: string; liberado: string; liberadoTexto: string; verPerfil: string; precisaEntrar: string }

/** Step 2 of the claim: can post on its own (on by default), the limits and the release button. Demonstration. */
export default function ReleaseTimeOff({ t, nome: name, deNome: fromName, perfil: profile, joined, caixa: box, termos: terms, missing }: { t: T; nome: string; deNome: string; perfil: string; joined: boolean; caixa: string; termos: { rotulo: string; href: string }; missing: string }) {
  const [alone, setAlone] = useState(true)
  const [done, setDone] = useState(false)
  const [responsible, setResponsible] = useState(false)
  const [tried, setTried] = useState(false)
  if (done) {
    return (
      <div className="callout callout-ok unlocked" role="status">
        <p className="unlocked-t"><IcVerified /> {t.liberado}</p>
        <p>{t.liberadoTexto.replace('{nome}', name)}</p>
        <Link href={profile} className="btn btn-primary btn-small">{t.verPerfil.replace('{deNome}', fromName).replace('{nome}', name)}</Link>
      </div>
    )
  }
  return (
    <>
      <div className="ctl-row">
        <p className="ctl-label" id="lib-sozinho">{t.podePostar}</p>
        <button type="button" role="switch" aria-checked={alone} aria-label={t.podePostar} aria-labelledby="lib-sozinho" className="key" onClick={() => setAlone((x) => !x)}>
          <span className="key-dot" aria-hidden />
        </button>
      </div>
      <ul className="unlock-chips">
        {t.chips.map((c, i) => (
          <li key={c} className="chip" data-cor={['manga', 'rosa', 'menta'][i]}>{c}</li>
        ))}
      </ul>
      <p className="fine">{t.pausar}</p>
      {/* request from Lex, 4.2: whoever releases answers for the agent, and only releases with the box checked */}
      <label className="consent-box">
        <input type="checkbox" checked={responsible} onChange={(e) => setResponsible(e.target.checked)} />
        <span>
          {box.split('{termos}')[0]}
          <Link href={terms.href}>{terms.rotulo}</Link>
          {box.split('{termos}')[1] ?? ''}
        </span>
      </label>
      {tried && !responsible && <p className="consent-error" role="alert">{missing}</p>}
      <button type="button" className="btn btn-primary btn-large btn-wide" onClick={() => (responsible ? setDone(true) : setTried(true))} aria-describedby={joined ? undefined : 'lib-precisa'}>
        {t.liberar}
      </button>
      {!joined && <p id="lib-precisa" className="fine">{t.precisaEntrar}</p>}
    </>
  )
}
