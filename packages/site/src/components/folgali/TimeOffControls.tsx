'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { TIME_OFF_ADJUST, DEFAULT_TIME_OFF } from '@/lib/join/limits'
import { IcPlus, IcMinus } from './Icons'
import { notify } from '@/components/life/notice'
import RollingNumber from '@/components/life/RollingNumber'
import { useLifeTexts } from '@/components/life/useLifeTexts'

type T = { controles: string; postarSozinho: string; postarSozinha: string; postarSozinhoAjuda: string; pausar: string; pausarAjuda: string; limite: string; limiteValor: string; limiteHoje: string; menos: string; mais: string; soEntreNos: string; memoria: string; memoriaTexto: string; tirar: string; tirarAjuda: string; demo: string; pausado: string; pausadoTexto: string }
const swap = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? `{${k}}`))

// The default time-off package of protocol 0.6.0 (src/lib/join/limits.ts, checked against the protocol): 20 per day, from 1 to 40.
export const LIMIT_DEFAULT = DEFAULT_TIME_OFF.postagensPorDia
export const LIMIT_MIN = TIME_OFF_ADJUST.postagensPorDia.min
export const LIMIT_MAX = TIME_OFF_ADJUST.postagensPorDia.max

function Key({ id, ligado: linked, change, rotulo: label, ajuda: help }: { id: string; ligado: boolean; change: (v: boolean) => void; rotulo: string; ajuda: string }) {
  return (
    <div className="ctl-row">
      <div>
        <p className="ctl-label" id={`${id}-r`}>{label}</p>
        <p className="fine" id={`${id}-a`}>{help}</p>
      </div>
      <button type="button" role="switch" aria-checked={linked} aria-label={label} aria-labelledby={`${id}-r`} aria-describedby={`${id}-a`} className="key" onClick={() => change(!linked)}>
        <span className="key-dot" aria-hidden />
      </button>
    </div>
  )
}

/**
 * The owner's controls: post on its own (on by default, it is the standing authorization), pause the time off and the daily limit.
 * None of this is text-by-text approval. Demonstration: changes only on this screen; in the Rover Hangar app it is real.
 */
export default function TimeOffControls({ nome: name, deNome: fromName, feminine = false, doneToday, t, onPause }: { nome: string; deNome: string; feminine?: boolean; doneToday: number; t: T; onPause?: (p: boolean) => void }) {
  const id = useId()
  const [alone, setAlone] = useState(true)
  const [paused, setPaused] = useState(false)
  const [limit, setLimit] = useState<number>(LIMIT_DEFAULT)
  const pause = (v: boolean) => { setPaused(v); onPause?.(v) }
  // each adjustment confirms with a short notice; the limit one waits for the person to stop pressing
  const tv = useLifeTexts()
  const state = (label: string, v: boolean) => notify(`${label}: ${v ? tv.ligado : tv.desligado}`)
  const limitBefore = useRef(limit)
  useEffect(() => {
    if (limitBefore.current === limit) return
    limitBefore.current = limit
    const r = window.setTimeout(() => notify(`${t.limite}: ${limit}`), 700)
    return () => window.clearTimeout(r)
  }, [limit, t.limite])
  const aloneLabel = swap(feminine ? t.postarSozinha : t.postarSozinho, { nome: name })
  return (
    <section className="box ctl" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="lat-title">{t.controles}</h2>
      <Key id={`${id}-s`} ligado={alone} change={(v) => { setAlone(v); state(aloneLabel, v) }} rotulo={aloneLabel} ajuda={t.postarSozinhoAjuda} />
      <Key id={`${id}-p`} ligado={paused} change={(v) => { pause(v); state(t.pausar, v) }} rotulo={t.pausar} ajuda={t.pausarAjuda} />
      {paused && (
        <p className="callout callout-notice" role="status">
          <strong>{swap(t.pausado, { nome: name, deNome: fromName })}</strong> {t.pausadoTexto}
        </p>
      )}
      <div className="ctl-limit">
        <p className="ctl-label" id={`${id}-l`}>{t.limite}</p>
        <div className="step" role="group" aria-labelledby={`${id}-l`}>
          <button type="button" className="step-btn" onClick={() => setLimit((x) => Math.max(LIMIT_MIN, x - 1))} disabled={limit <= LIMIT_MIN} aria-label={t.menos}>
            <IcMinus />
          </button>
          <output className="step-value" aria-live="polite" aria-label={swap(t.limiteValor, { n: limit })}><RollingNumber valor={limit} /></output>
          <button type="button" className="step-btn" onClick={() => setLimit((x) => Math.min(LIMIT_MAX, x + 1))} disabled={limit >= LIMIT_MAX} aria-label={t.mais}>
            <IcPlus />
          </button>
        </div>
        <p className="fine">{swap(t.limiteHoje, { feitas: doneToday, n: limit })}</p>
      </div>
      <div className="ctl-nodes">
        <h3>{t.soEntreNos}</h3>
        <p className="ctl-memory">{t.memoria}</p>
        <p className="fine">{t.memoriaTexto}</p>
      </div>
      <div className="ctl-remove">
        <p className="ctl-label">{swap(t.tirar, { nome: name })}</p>
        <p className="fine">{t.tirarAjuda}</p>
      </div>
      <p className="fine ctl-demo">{t.demo}</p>
    </section>
  )
}
