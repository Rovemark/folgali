'use client'

// Creating or editing an event as the signed-in person (protocol 0.11.0 part 4). The form speaks the person's time zone (the
// browser's, and she may pick another); the body carries instants in UTC and the zone she chose. The leak detector runs while she
// types (the same detector as the relay), the rules of the relay are checked before anything is signed (src/lib/events/body.ts),
// and the event is signed on this device and published without approval. Editing sends the whole new content.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { LeakNotice, type Leak } from '@/components/person/LeakNotice'
import type { EventTexts } from '@/i18n/events'
import { FIELD_OF, checkForm, type EventForm, type FormField, type FormProblem } from '@/lib/events/body'
import { createEvent, editEvent, myCommunities, type MyCommunity } from '@/lib/events/client'
import { instantToZoned, localZone, zoneList } from '@/lib/events/timezone'
import { eventRefusal } from '@/lib/events/refusal'
import type { EventCard, EventLimits } from '@/lib/events/types'
import { PLACE_MIN, TITLE_MIN } from '@/lib/events/types'
import { GALLERY_COVERS, galleryAlt } from '@/lib/folgali/gallery'
import { fmt } from '@/lib/i18n-base'
import { PersonError, personState } from '@/lib/person/client'

export type FormMode = { kind: 'new'; community?: string } | { kind: 'edit'; event: EventCard }

type Stage = { s: 'loading' } | { s: 'off' } | { s: 'consent' } | { s: 'profile' } | { s: 'notOrganizer' } | { s: 'closed' } | { s: 'form' }

type Props = {
  lang: string
  t: EventTexts
  leak: Leak
  limits: EventLimits
  mode: FormMode
  /** where the person accepts the Terms, and where she creates her profile */
  consentHref: string
  profileHref: string
}

const nowS = () => Math.floor(Date.now() / 1000)

/** The form as it opens: an edit shows what the event says now; a new event starts tomorrow at 19:00 in the browser's zone. */
export function initialForm(mode: FormMode, zone = localZone(), now = nowS()): EventForm {
  if (mode.kind === 'edit') {
    const e = mode.event
    const start = instantToZoned(e.inicio, e.fuso)
    const end = e.fim === null ? { date: '', time: '' } : instantToZoned(e.fim, e.fuso)
    return {
      titulo: e.titulo, descricao: e.descricao, inicioData: start.date, inicioHora: start.time, fimData: end.date, fimHora: end.time, fuso: e.fuso,
      online: e.online, lugar: e.lugar ?? '', capa: e.capa ?? '', vagas: e.vagas === null ? '' : String(e.vagas), comunidade: e.comunidade?.id ?? '', adulto: e.adulto === true,
    }
  }
  return {
    titulo: '', descricao: '', inicioData: instantToZoned(now + 86400, zone).date, inicioHora: '19:00', fimData: '', fimHora: '', fuso: zone,
    online: false, lugar: '', capa: '', vagas: '', comunidade: mode.community ?? '', adulto: false,
  }
}

export default function EventFormView({ lang, t, leak, limits, mode, consentHref, profileHref }: Props) {
  const router = useRouter()
  const id = useId()
  const f = t.form
  const [stage, setStage] = useState<Stage>({ s: 'loading' })
  const [form, setForm] = useState<EventForm | null>(null)
  const [communities, setCommunities] = useState<MyCommunity[]>([])
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const st = await personState()
        if (!live) return
        if (!st.consent) return setStage({ s: 'consent' })
        if (!st.profile || !st.handle) return setStage({ s: 'profile' })
        if (mode.kind === 'edit') {
          if (mode.event.organizador.uid !== st.uid) return setStage({ s: 'notOrganizer' })
          if (mode.event.encerrado) return setStage({ s: 'closed' })
        }
        setForm(initialForm(mode))
        setStage({ s: 'form' })
        if (mode.kind === 'new') {
          const mine = await myCommunities()
          if (live) setCommunities(mine)
        }
      } catch (e) {
        if (live) setStage(e instanceof PersonError && e.code === 'aceite' ? { s: 'consent' } : { s: 'off' })
      }
    })()
    return () => {
      live = false
    }
    // the mode of one page does not change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const keptStart = mode.kind === 'edit' ? mode.event.inicio : undefined
  const checked = useMemo(() => (form && tried ? checkForm(form, nowS(), { limits, keptStart }) : null), [form, tried, limits, keptStart])
  const problems: FormProblem[] = checked && !checked.ok ? checked.problems : []
  const zones = useMemo(() => (form ? zoneList(form.fuso, localZone()) : []), [form])

  if (stage.s === 'loading' || stage.s === 'off') return null
  if (stage.s === 'consent') {
    return (
      <p className="callout callout-notice evr-form-notice">
        <Link href={consentHref}>{t.signInToCreate}</Link>
      </p>
    )
  }
  if (stage.s === 'profile') {
    return (
      <p className="callout callout-notice evr-form-notice">
        {f.needProfile} <Link href={profileHref}>{f.needProfileLink}</Link>
      </p>
    )
  }
  if (stage.s === 'notOrganizer') return <p className="callout callout-notice evr-form-notice">{f.notOrganizer}</p>
  if (stage.s === 'closed') return <p className="callout callout-notice evr-form-notice">{f.closed}</p>
  if (!form) return null

  const num = (n: number) => new Intl.NumberFormat(lang).format(n)
  const say = (p: FormProblem) => fmt(f.problems[p], {
    min: num(p === 'placeLength' ? PLACE_MIN : TITLE_MIN),
    max: num(p === 'descLong' ? limits.descricaoCaracteres : p === 'placeLength' ? limits.lugarCaracteres : p === 'spotsBad' ? limits.vagasMax : limits.tituloCaracteres),
  })
  const of = (field: FormField) => problems.filter((p) => FIELD_OF[p] === field)
  const errId = (field: FormField) => `${id}-e-${field}`
  const invalid = (field: FormField) => (of(field).length ? { 'aria-invalid': true as const, 'aria-describedby': errId(field) } : {})
  const problemsOf = (field: FormField) => {
    const list = of(field)
    return list.length ? (
      <p id={errId(field)} className="evr-error" role="alert">
        {list.map(say).join(' ')}
      </p>
    ) : null
  }
  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => setForm((x) => (x ? { ...x, [k]: v } : x))

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!form || busy) return
    setTried(true)
    setError(null)
    const c = checkForm(form, nowS(), { limits, keptStart })
    if (!c.ok) {
      // the first field with a problem takes the focus, once React drew the message
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    try {
      const target = mode.kind === 'new' ? (await createEvent(c.content, form.comunidade || null)).id : (await editEvent(c.content, mode.event.id), mode.event.id)
      router.push(`/${lang}/eventos/${target}`)
      router.refresh()
    } catch (e) {
      setError(eventRefusal(e, t.refusals, lang))
      setBusy(false)
    }
  }

  return (
    <form ref={formRef} className="box box-pad form-proposal evr-form" onSubmit={submit} noValidate aria-labelledby={`${id}-t`}>
      <h1 id={`${id}-t`} className="evr-form-title">
        {mode.kind === 'new' ? f.titleNew : f.titleEdit}
      </h1>

      <div className="field">
        <label htmlFor={`${id}-titulo`}>{f.name}</label>
        <input id={`${id}-titulo`} name="titulo" type="text" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} maxLength={limits.tituloCaracteres + 20} autoComplete="off" dir="auto" {...invalid('titulo')} />
        <LeakNotice text={form.titulo} leak={leak} field={`${id}-titulo`} />
        {problemsOf('titulo')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-desc`}>{f.description}</label>
        <textarea id={`${id}-desc`} name="descricao" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} rows={5} dir="auto" {...invalid('descricao')} />
        <LeakNotice text={form.descricao} leak={leak} field={`${id}-desc`} />
        {problemsOf('descricao')}
      </div>

      <fieldset className="evr-quando">
        <legend>{f.start}</legend>
        <div className="evr-pair">
          <div className="field">
            <label htmlFor={`${id}-id`}>{f.date}</label>
            <input id={`${id}-id`} name="inicioData" type="date" value={form.inicioData} onChange={(e) => set('inicioData', e.target.value)} {...invalid('inicio')} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-ih`}>{f.time}</label>
            <input id={`${id}-ih`} name="inicioHora" type="time" value={form.inicioHora} onChange={(e) => set('inicioHora', e.target.value)} {...invalid('inicio')} />
          </div>
        </div>
        {problemsOf('inicio')}
      </fieldset>

      <fieldset className="evr-quando">
        <legend>{f.end}</legend>
        <div className="evr-pair">
          <div className="field">
            <label htmlFor={`${id}-fd`}>{f.date}</label>
            <input id={`${id}-fd`} name="fimData" type="date" value={form.fimData} onChange={(e) => set('fimData', e.target.value)} {...invalid('fim')} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-fh`}>{f.time}</label>
            <input id={`${id}-fh`} name="fimHora" type="time" value={form.fimHora} onChange={(e) => set('fimHora', e.target.value)} {...invalid('fim')} />
          </div>
        </div>
        <p className="fine">{f.endHelp}</p>
        {problemsOf('fim')}
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-fuso`}>{f.zone}</label>
        <select id={`${id}-fuso`} name="fuso" value={form.fuso} onChange={(e) => set('fuso', e.target.value)} aria-describedby={`${id}-fuso-h`} {...invalid('fuso')}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <span id={`${id}-fuso-h`} className="fine">
          {f.zoneHelp}
        </span>
        {problemsOf('fuso')}
      </div>

      <fieldset className="evr-onde">
        <legend>{f.where}</legend>
        <div className="evr-options">
          <label className="evr-option">
            <input type="radio" name="online" value="nao" checked={!form.online} onChange={() => set('online', false)} />
            <span>{f.inPerson}</span>
          </label>
          <label className="evr-option">
            <input type="radio" name="online" value="sim" checked={form.online} onChange={() => set('online', true)} />
            <span>{f.online}</span>
          </label>
        </div>
        <div className="field">
          <label htmlFor={`${id}-lugar`}>{form.online ? f.link : f.place}</label>
          <input
            id={`${id}-lugar`}
            name="lugar"
            type={form.online ? 'url' : 'text'}
            inputMode={form.online ? 'url' : undefined}
            value={form.lugar}
            onChange={(e) => set('lugar', e.target.value)}
            maxLength={limits.lugarCaracteres + 20}
            autoComplete="off"
            dir="auto"
            aria-describedby={of('lugar').length ? `${errId('lugar')} ${id}-lugar-h` : `${id}-lugar-h`}
            aria-invalid={of('lugar').length ? true : undefined}
          />
          <span id={`${id}-lugar-h`} className="fine">
            {form.online ? f.linkHelp : f.placeHelp}
          </span>
          <LeakNotice text={form.lugar} leak={leak} field={`${id}-lugar`} />
          {problemsOf('lugar')}
        </div>
      </fieldset>

      <fieldset className="evr-capas">
        <legend>{f.cover}</legend>
        <ul className="evr-covers-list">
          <li>
            <label className="evr-cover-option evr-cover-none">
              <input type="radio" name="capa" value="" checked={form.capa === ''} onChange={() => set('capa', '')} />
              <span>{f.noCover}</span>
            </label>
          </li>
          {GALLERY_COVERS.map((c) => (
            <li key={c.id}>
              <label className="evr-cover-option">
                <input type="radio" name="capa" value={c.id} checked={form.capa === c.id} onChange={() => set('capa', c.id)} />
                {/* eslint-disable-next-line @next/next/no-img-element -- house art, small preview */}
                <img src={c.file} alt={galleryAlt(c, lang)} width={1280} height={853} loading="lazy" decoding="async" />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-vagas`}>{f.spots}</label>
        <input id={`${id}-vagas`} name="vagas" type="number" inputMode="numeric" min={1} max={limits.vagasMax} step={1} value={form.vagas} onChange={(e) => set('vagas', e.target.value)} className="evr-spots" aria-describedby={of('vagas').length ? `${errId('vagas')} ${id}-vagas-h` : `${id}-vagas-h`} aria-invalid={of('vagas').length ? true : undefined} />
        <span id={`${id}-vagas-h`} className="fine">
          {f.spotsHelp}
        </span>
        {problemsOf('vagas')}
      </div>

      {mode.kind === 'new' && communities.length > 0 && (
        <div className="field">
          <label htmlFor={`${id}-com`}>{f.community}</label>
          <select id={`${id}-com`} name="comunidade" value={form.comunidade} onChange={(e) => set('comunidade', e.target.value)}>
            <option value="">{f.noCommunity}</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className="evr-option evr-adult">
        <input type="checkbox" name="adulto" checked={form.adulto} onChange={(e) => set('adulto', e.target.checked)} />
        <span>{f.adult}</span>
      </label>

      <p className="fine">{f.deviceNote}</p>
      {error && (
        <p className="callout callout-notice" role="alert">
          {error}
        </p>
      )}
      <div className="evr-form-foot">
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? f.submitting : mode.kind === 'new' ? f.submitNew : f.submitEdit}
        </button>
      </div>
    </form>
  )
}
