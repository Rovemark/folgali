'use client'

// Settings > Profile: a PERSON changes her folgali profile (name, one line, about, interests, who leaves notes, portrait and cover).
// A new `perfil` object replaces the previous one as a whole, so the form starts from the body on the relay and keeps every field it
// does not show (graph, approvals, skills, listing). Portrait and cover come from the house gallery (revision 0.9.0), which works with
// image uploads off; the person signs on the device, like every other object (src/lib/person/client.ts). When the relay announces
// `midia-de-perfil` (decision of 25/11/2026), she can also send her own photo as portrait or cover (PhotoUpload).
import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import { GALLERY_COVERS, GALLERY_PORTRAITS, galleryAlt, galleryPortrait } from '@/lib/folgali/gallery'
import { findLeaks } from '@/lib/leak-detector'
import { LEAK_GROUP } from '@/lib/leak-messages'
import { deviceSupported } from '@/lib/person/device'
import { PersonError, personState, publish, type PersonState } from '@/lib/person/client'
import type { PhotoTexts } from '@/i18n/photo'
import type { ProfileTexts } from '@/i18n/profile'
import PhotoUpload from './PhotoUpload'
import type { AttachTexts } from '@/i18n/attach'

type Leak = Record<'chave' | 'senha' | 'contato' | 'documento' | 'interno', string>
type Stage = { s: 'loading' } | { s: 'out' } | { s: 'off' } | { s: 'unsupported' } | { s: 'consent' } | { s: 'noprofile' } | { s: 'form'; st: PersonState }
type Props = { t: ProfileTexts; leak: Leak; lang: string; signIn: string | null; unsupported: string; consentHref: string; notesHelp?: string; pt: PhotoTexts; uploads: boolean; /** the refusals that say how long is left (src/i18n/attach.ts) */ rt?: AttachTexts['refusals'] }

const TAG = /^[a-z0-9][a-z0-9-]{1,23}$/
const NOTES = ['todos', 'amigos', 'ninguem'] as const
type Notes = (typeof NOTES)[number]

/** "Jogos de tabuleiro, café" -> ["jogos-de-tabuleiro", "cafe"]: the tag form the protocol takes. */
export function toTags(text: string): string[] {
  const tags = text
    .split(',')
    .map((x) => x.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24))
    .filter((x) => TAG.test(x))
  return [...new Set(tags)].slice(0, 8)
}

const str = (x: unknown) => (typeof x === 'string' ? x : '')

/**
 * The display name is free (decision of the owner, 25/11/2026: "the person has to be free to pick whatever she wants, a surname is
 * fine"): names, surnames, particles, accents and nicknames pass. Only what would leak a secret or a way to reach the person stops it:
 * a key, a password, a token, an e-mail, a phone number, a document or a card. The other texts keep the whole detector.
 */
const NAME_BLOCKS = new Set(['chave-privada', 'chave-de-api', 'token', 'url-com-credencial', 'senha', 'email', 'telefone', 'cpf', 'cnpj', 'cartao'])
export function nameLeak(name: string) {
  return findLeaks(name).find((x) => NAME_BLOCKS.has(x.tipo))
}

/** A photo choice in the form: `photo:<id of the imagem object>`. */
const PHOTO = 'photo:'
const photoId = (choice: string) => (choice.startsWith(PHOTO) ? choice.slice(PHOTO.length) : null)
const mediaOf = (x: Record<string, unknown> | undefined) => (x && typeof x.midia === 'string' ? x.midia : null)

export default function ProfileEditor({ t, leak, lang, signIn, unsupported, consentHref, pt, uploads, rt }: Props) {
  const [stage, setStage] = useState<Stage>({ s: 'loading' })
  useEffect(() => {
    let live = true
    ;(async () => {
      if (!(await deviceSupported())) return live && setStage({ s: 'unsupported' })
      try {
        const st = await personState()
        if (!live) return
        if (!st.consent) return setStage({ s: 'consent' })
        setStage(st.profile && st.handle && st.body ? { s: 'form', st } : { s: 'noprofile' })
      } catch (e) {
        if (live) setStage(e instanceof PersonError && e.status === 401 ? { s: 'out' } : { s: 'off' })
      }
    })()
    return () => {
      live = false
    }
  }, [])
  if (stage.s === 'loading') return <p className="fine" aria-busy>…</p>
  if (stage.s === 'off') return null
  if (stage.s === 'unsupported') return <p className="callout callout-notice">{unsupported}</p>
  if (stage.s === 'out') {
    return (
      <div className="pf-join">
        <p>{t.signedOutEdit}</p>
        {signIn && <a href={signIn} className="btn btn-primary">{t.signIn}</a>}
      </div>
    )
  }
  if (stage.s === 'consent') {
    return (
      <p className="callout callout-notice">
        <Link href={consentHref}>{t.acceptTerms}</Link>
      </p>
    )
  }
  if (stage.s === 'noprofile') {
    return (
      <p className="callout">
        {t.noProfileYet} <Link href={`/${lang}/linha`}>{t.createProfile}</Link>
      </p>
    )
  }
  return <Form t={t} leak={leak} lang={lang} st={stage.st} pt={pt} uploads={uploads} rt={rt} />
}

function Form({ t, leak, lang, st, pt, uploads, rt }: { t: ProfileTexts; leak: Leak; lang: string; st: PersonState; pt: PhotoTexts; uploads: boolean; rt?: AttachTexts['refusals'] }) {
  const id = useId()
  const body = st.body ?? {}
  const portraitBody = body.retrato as Record<string, unknown> | undefined
  const coverBody = body.capa as Record<string, unknown> | undefined
  // the portrait as it is now: a gallery id, the person avatar (none) or something else this form does not edit (Hangar pieces, a photo)
  // with uploads paused (the emergency switch), a photo on the profile is not shown here: the profile already shows the default
  const startPortrait = portraitBody === undefined ? 'person' : galleryPortrait(portraitBody.galeria) ? str(portraitBody.galeria) : mediaOf(portraitBody) ? (uploads ? PHOTO + mediaOf(portraitBody) : 'person') : 'keep'
  const [name, setName] = useState(str(body.nome))
  const [description, setDescription] = useState(str(body.descricao))
  const [about, setAbout] = useState(str(body.sobre))
  const [interests, setInterests] = useState(Array.isArray(body.interesses) ? (body.interesses as string[]).join(', ') : '')
  const [notes, setNotes] = useState<Notes>(NOTES.includes(body.recados as Notes) ? (body.recados as Notes) : 'todos')
  const [portrait, setPortrait] = useState<string>(startPortrait)
  const [cover, setCover] = useState<string>(coverBody && typeof coverBody.galeria === 'string' ? coverBody.galeria : mediaOf(coverBody) ? (uploads ? PHOTO + mediaOf(coverBody) : '') : coverBody ? 'keep' : '')
  // the photos this screen knows: the ones already on the profile (no preview here) and the ones sent now (preview from the device)
  const [photos, setPhotos] = useState<Record<string, string | null>>(() => Object.fromEntries([mediaOf(portraitBody), mediaOf(coverBody)].filter((x): x is string => !!x).map((x) => [x, null])))
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')

  const found = useMemo(() => nameLeak(name) ?? findLeaks(`${description}\n${about}`)[0], [name, description, about])
  const ok = name.trim().length > 0 && name.trim().length <= 40 && description.length <= 280 && about.length <= 600 && !found

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setState('idle')
    // start from the body on the relay: what this form does not show stays as it is
    const next: Record<string, unknown> = { ...body, nome: name.trim(), descricao: description.trim() }
    for (const k of ['sobre', 'interesses', 'retrato', 'capa'] as const) delete next[k]
    if (about.trim()) next.sobre = about.trim()
    const tags = toTags(interests)
    if (tags.length) next.interesses = tags
    next.recados = notes
    // a photo only goes while the relay takes photos; with uploads paused (the emergency switch) it falls back to the default
    const photoP = photoId(portrait)
    const photoC = photoId(cover)
    if (portrait === 'keep' && portraitBody) next.retrato = portraitBody
    else if (photoP) {
      if (uploads) next.retrato = { midia: photoP }
    } else if (portrait !== 'person' && portrait !== 'keep') next.retrato = { galeria: portrait }
    if (cover === 'keep' && coverBody) next.capa = coverBody
    else if (photoC) {
      if (uploads) next.capa = { midia: photoC }
    } else if (cover && cover !== 'keep') next.capa = { galeria: cover }
    next.grafo ??= 'publico'
    next.exigirAprovacao ??= []
    try {
      await publish('perfil', next)
      // a photo the profile no longer uses comes down from the relay too (best effort: the profile is already saved)
      const used = new Set([photoP, photoC].filter(Boolean))
      // never while uploads are paused: the emergency switch hides photos, it does not delete them
      if (uploads) {
        for (const old of Object.keys(photos)) {
          if (!used.has(old)) await publish('remocao-pelo-autor', { alvo: old }).catch(() => undefined)
        }
      }
      setPhotos((p) => Object.fromEntries(Object.entries(p).filter(([k]) => used.has(k))))
      setState('saved')
    } catch {
      setState('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="box box-pad form-proposal pe-form" onSubmit={save} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="pw-title">{t.editTitle}</h2>
      <p className="fine">{t.editIntro}</p>
      <div className="field">
        <label htmlFor={`${id}-n`}>{t.nameLabel}</label>
        <input id={`${id}-n`} type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-d`}>{t.descriptionLabel}</label>
        <input id={`${id}-d`} type="text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${id}-s`}>{t.aboutLabel}</label>
        <textarea id={`${id}-s`} rows={4} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={600} />
      </div>
      {found && <p className="notice-leak" role="alert">{leak[LEAK_GROUP[found.tipo]]}</p>}
      <div className="field">
        <label htmlFor={`${id}-i`}>{t.interestsLabel}</label>
        <input id={`${id}-i`} type="text" value={interests} onChange={(e) => setInterests(e.target.value)} maxLength={240} autoComplete="off" aria-describedby={`${id}-ih`} />
        <span id={`${id}-ih`} className="help">{t.interestsHelp}</span>
      </div>
      <fieldset className="field pe-notes">
        <legend>{t.notesLabel}</legend>
        {NOTES.map((r) => (
          <label key={r} className="pe-option">
            <input type="radio" name={`${id}-r`} value={r} checked={notes === r} onChange={() => setNotes(r)} />
            {r === 'todos' ? t.notesAll : r === 'amigos' ? t.notesFriends : t.notesNobody}
          </label>
        ))}
      </fieldset>
      <fieldset className="field">
        <legend>{t.portraitLabel}</legend>
        <ul className="pe-grid pe-portraits">
          <li>
            <label className="pe-choice pe-pessoa" data-on={portrait === 'person'}>
              <input type="radio" name={`${id}-p`} value="person" checked={portrait === 'person'} onChange={() => setPortrait('person')} className="reader-only" />
              <svg viewBox="0 0 48 48" aria-hidden focusable="false"><circle cx="24" cy="24" r="24" fill="var(--tecido-2)" /><circle cx="24" cy="19" r="8" fill="var(--tinta-3)" /><path d="M9 41c2.5-8 8.5-12 15-12s12.5 4 15 12" fill="var(--tinta-3)" /></svg>
              <span className="reader-only">{t.portraitPerson}</span>
            </label>
          </li>
          {startPortrait === 'keep' && (
            <li>
              <label className="pe-choice" data-on={portrait === 'keep'}>
                <input type="radio" name={`${id}-p`} value="keep" checked={portrait === 'keep'} onChange={() => setPortrait('keep')} className="reader-only" />
                <span className="pe-keep">{t.portraitKeep}</span>
              </label>
            </li>
          )}
          {photoId(portrait) && (
            <li>
              <label className="pe-choice pe-photo-chosen" data-on="true">
                <input type="radio" name={`${id}-p`} value={portrait} checked readOnly className="reader-only" />
                {photos[photoId(portrait)!] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[photoId(portrait)!]!} alt={pt.yours} width={72} height={72} />
                ) : (
                  <span className="pe-keep">{pt.yours}</span>
                )}
              </label>
            </li>
          )}
          {GALLERY_PORTRAITS.map((g) => (
            <li key={g.id}>
              <label className="pe-choice" data-on={portrait === g.id}>
                <input type="radio" name={`${id}-p`} value={g.id} checked={portrait === g.id} onChange={() => setPortrait(g.id)} className="reader-only" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.file} alt={galleryAlt(g, lang)} width={72} height={72} loading="lazy" decoding="async" />
              </label>
            </li>
          ))}
        </ul>
        {uploads ? (
          <div className="pe-photo-row">
            <PhotoUpload use="retrato" t={pt} r={rt} lang={lang} name={name} onDone={(p) => { setPhotos((x) => ({ ...x, [p.id]: p.preview })); setPortrait(PHOTO + p.id) }} />
            {photoId(portrait) && <button type="button" className="btn btn-calm btn-small" onClick={() => setPortrait('person')}>{pt.remove}</button>}
          </div>
        ) : null}
      </fieldset>
      <fieldset className="field">
        <legend>{t.coverLabel}</legend>
        <ul className="pe-grid pe-covers">
          <li>
            <label className="pe-choice pe-default-cover" data-on={cover === ''}>
              <input type="radio" name={`${id}-c`} value="" checked={cover === ''} onChange={() => setCover('')} className="reader-only" />
              <span>{t.coverDefault}</span>
            </label>
          </li>
          {photoId(cover) && (
            <li>
              <label className="pe-choice pe-photo-chosen" data-on="true">
                <input type="radio" name={`${id}-c`} value={cover} checked readOnly className="reader-only" />
                {photos[photoId(cover)!] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[photoId(cover)!]!} alt={pt.yours} width={192} height={64} />
                ) : (
                  <span className="pe-keep">{pt.yours}</span>
                )}
              </label>
            </li>
          )}
          {GALLERY_COVERS.map((g) => (
            <li key={g.id}>
              <label className="pe-choice" data-on={cover === g.id}>
                <input type="radio" name={`${id}-c`} value={g.id} checked={cover === g.id} onChange={() => setCover(g.id)} className="reader-only" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.file} alt={galleryAlt(g, lang)} width={192} height={128} loading="lazy" decoding="async" />
              </label>
            </li>
          ))}
        </ul>
        {uploads ? (
          <div className="pe-photo-row">
            <PhotoUpload use="capa" t={pt} r={rt} lang={lang} name={name} onDone={(p) => { setPhotos((x) => ({ ...x, [p.id]: p.preview })); setCover(PHOTO + p.id) }} />
            {photoId(cover) && <button type="button" className="btn btn-calm btn-small" onClick={() => setCover('')}>{pt.remove}</button>}
          </div>
        ) : (
          <p className="fine">{pt.paused}</p>
        )}
        {uploads && <p className="fine pe-rights">{pt.rights}</p>}
      </fieldset>
      <div className="pw-foot">
        <button type="submit" className="btn btn-primary" disabled={!ok || busy} aria-busy={busy}>{busy ? t.saving : t.save}</button>
      </div>
      {state === 'saved' && (
        <p className="callout callout-ok" role="status">
          {t.saved} <Link href={`/${lang}/r/${st.handle}`}>{t.seeProfile}</Link>
        </p>
      )}
      {state === 'error' && <p className="callout callout-notice" role="alert">{t.failed}</p>}
    </form>
  )
}
