'use client'

// A PERSON writes on folgali (protocol 0.7, docs/INTEGRATION-ROVEMARK-PEOPLE.md). Three moments in one box:
//   1. the device: WebCrypto Ed25519 with the private key not extractable, kept in IndexedDB (src/lib/person/device.ts);
//   2. the first profile: the person picks the @ and the name. Nothing comes from the Rovemark account (contract, section 6.4);
//      Rovemark signs the attestation for this device and the browser publishes the profile, signed here;
//   3. the composer: the leak detector runs while typing (same detector as the relay), and the post is signed on the device.
//      With `midia-livre` on the relay (protocol 0.11.0) she attaches up to 4 images: each is reduced and cleaned on the device,
//      every file is uploaded BEFORE anything is published, then the post, then one `imagem` object per image, in order.
// With `video` on the relay (0.11.0 part 3) she attaches ONE video instead: checked and cleaned on the device (container, size,
// duration, metadata out, src/lib/person/video.ts), its poster frame drawn here; the video and the poster go first (with the share of
// the upload on screen), then the post, then the `video` object. Images OR a video: choosing one hides the other.
// The same box answers (`mode`): a reply to a post (`resposta`, up to 1000 characters) or a reply in the forum (`resposta-forum`,
// up to 1500), with the same leak check and attachments. A forum refusal says what unblocks it (join the community, wait, locked),
// and "join and reply" joins an open community for her, then sends the reply.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { IcCamera, IcClose, IcVideo } from '@/components/folgali/Icons'
import { findLeaks } from '@/lib/leak-detector'
import { LeakNotice, type Leak } from './LeakNotice'
import { deviceSupported } from '@/lib/person/device'
import { PersonError, ensureAttestation, personState, publish, publishAttachment, publishVideo, uploadMedia, uploadVideo, type PersonState, type VideoReceipt } from '@/lib/person/client'
import { ATTACH_ALT_MAX, ATTACH_MAX, altProblem, checkPickedFile, prepareFile, type Prepared } from '@/lib/person/media'
import { formatWait, refusalText, waitOf, type Counted } from '@/lib/person/refusal'
import { VIDEO_MIME, formatDuration, formatMegabytes, prepareVideo, type CleanVideo, type VideoRefusal } from '@/lib/person/video'
import { drawPoster } from '@/lib/person/video-poster'
import type { AttachTexts } from '@/i18n/attach'
import type { VideoTexts } from '@/i18n/video'
import type { PersonTexts } from '@/i18n/person'
import type { EditTexts } from '@/i18n/edit'

// the leak notice moved to its own file (the inline editor uses it too); kept exported from here for who imported it before
export { LeakNotice }

const HANDLE_RE = /^[a-z0-9._]{3,30}$/
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')

type Stage = { s: 'loading' } | { s: 'unsupported' } | { s: 'consent' } | { s: 'profile'; st: PersonState } | { s: 'compose'; st: PersonState; nome: string } | { s: 'off'; code: string }

/** What the box writes: a post (the default), a reply to a post, or a reply in a forum topic (`em`: the reply it answers, or null). */
export type WriteMode =
  | { kind: 'post' }
  | { kind: 'reply'; alvo: string }
  | { kind: 'forum'; topico: string; em: string | null; comunidade: string; acesso: 'aberta' | 'moderada' | 'fechada' }

const MAX_TEXT: Record<WriteMode['kind'], number> = { post: 1500, reply: 1000, forum: 1500 }

type Props = {
  t: PersonTexts
  leak: Leak
  lang: string
  consentHref: string
  /** the texts of attachments and of the refusals that say how long is left (src/i18n/attach.ts) */
  at: AttachTexts
  /** the relay announces `midia-livre`: the composer offers "attach image" */
  media?: boolean
  /** a post (default) or a reply; a reply needs `rt`, the texts of the reply box (src/i18n/edit.ts) */
  mode?: WriteMode
  rt?: EditTexts['reply']
  /** 0.11.0 part 3: the relay announces `video`: the composer offers "attach video" (needs `vt`) */
  video?: boolean
  vt?: VideoTexts
}

export default function PersonWriter({ t, leak, lang, consentHref, at, media = false, mode = { kind: 'post' }, rt, video = false, vt }: Props) {
  const id = useId()
  const [stage, setStage] = useState<Stage>({ s: 'loading' })

  useEffect(() => {
    let live = true
    ;(async () => {
      if (!(await deviceSupported())) return live && setStage({ s: 'unsupported' })
      try {
        const st = await personState()
        if (!live) return
        if (!st.consent) return setStage({ s: 'consent' })
        if (st.adult === false) return setStage({ s: 'off', code: 'minor' })
        setStage(st.profile && st.handle ? { s: 'compose', st, nome: st.name || st.handle } : { s: 'profile', st })
      } catch (e) {
        if (live) setStage({ s: 'off', code: e instanceof PersonError ? e.code : 'erro' })
      }
    })()
    return () => {
      live = false
    }
  }, [])

  if (stage.s === 'loading') return null
  if (stage.s === 'unsupported') return <p className="callout callout-notice pw-box">{t.unsupported}</p>
  if (stage.s === 'consent') {
    return (
      <p className="callout callout-notice pw-box">
        {t.needConsent} <Link href={consentHref}>{t.consentLink}</Link>
      </p>
    )
  }
  if (stage.s === 'off') {
    // not wired on this site (503) or signed out: nothing to offer here; minors and revoked accounts are told why
    if (stage.code === 'minor') return <p className="callout callout-notice pw-box">{t.errors.minor}</p>
    if (stage.code === 'atestado_revogado') return <p className="callout callout-notice pw-box">{t.errors.revoked}</p>
    return null
  }
  if (stage.s === 'profile') return <FirstProfile t={t} at={at} lang={lang} leak={leak} id={id} onDone={(st, name) => setStage({ s: 'compose', st, nome: name })} />
  return <Composer t={t} at={at} leak={leak} id={id} lang={lang} st={stage.st} nome={stage.nome} media={media} mode={mode} rt={rt} vt={video ? vt : undefined} />
}

/**
 * A refusal as a sentence for the person. With the 0.11.0 texts (`r`), a limit says what was being counted and when it unblocks
 * ("Você chegou ao limite de postagens. Libera em 12 minutos."), and the media refusals have their own sentence.
 */
export function message(t: PersonTexts, e: unknown, r?: { t: AttachTexts['refusals']; lang: string; counted?: Counted }): string {
  const code = e instanceof PersonError ? e.code : ''
  if (r?.counted) {
    const own = refusalText(e, r.t, r.lang, r.counted)
    if (own) return own
  }
  if (code === 'handle_taken' || code === 'handle_em_uso') return t.errors.handle_taken
  if (code === 'handle_reserved') return t.errors.handle_reserved
  if (code === 'handle_invalid') return t.errors.handle_invalid
  if (code === 'minor') return t.errors.minor
  if (code === 'atestado_revogado') return t.errors.revoked
  if (code === 'limite_de_taxa' || code === 'limite' || code === 'autorizacao_esgotada') {
    const wait = r ? waitOf(e) : null
    return wait === null || !r ? t.errors.rate : `${t.errors.rate} ${r.t.unlocksIn.replace('{espera}', formatWait(wait, r.lang))}`
  }
  if (code === 'sem_sessao' || code === 'acesso_invalido' || code === 'acesso_revogado') return t.errors.signed_out
  return t.errors.generic
}

function FirstProfile({ t, at, lang, leak, id, onDone }: { t: PersonTexts; at: AttachTexts; lang: string; leak: Leak; id: string; onDone: (st: PersonState, name: string) => void }) {
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const h = handle.trim().toLowerCase().replace(/^@/, '')
  const leaks = findLeaks(`${name}\n${bio}`).length > 0
  const ok = HANDLE_RE.test(h) && !/^[._]|[._]$/.test(h) && name.trim().length > 0 && name.trim().length <= 40 && bio.length <= 280 && !leaks

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      await ensureAttestation({ handle: h })
      await publish('perfil', { nome: name.trim(), descricao: bio.trim(), grafo: 'publico', exigirAprovacao: [] })
      onDone(await personState(), name.trim())
    } catch (x) {
      setError(message(t, x, { t: at.refusals, lang }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="box box-pad pw-box form-proposal" onSubmit={create} aria-labelledby={`${id}-pt`}>
      <h2 id={`${id}-pt`} className="pw-title">{t.profileTitle}</h2>
      <p className="fine">{t.profileIntro}</p>
      <div className="field">
        <label htmlFor={`${id}-h`}>{t.handleLabel}</label>
        <input id={`${id}-h`} type="text" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} autoComplete="off" spellCheck={false} maxLength={31} aria-describedby={`${id}-hh`} />
        <span id={`${id}-hh`} className="help">{t.handleHelp}</span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-n`}>{t.nameLabel}</label>
        {/* empty on purpose: the profile name is what the person writes on folgali, never the Rovemark account name */}
        <input id={`${id}-n`} type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={40} aria-describedby={`${id}-nh`} />
        <span id={`${id}-nh`} className="help">{t.nameHelp}</span>
        <LeakNotice text={name} leak={leak} field={`${id}-n`} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-b`}>{t.bioLabel}</label>
        <input id={`${id}-b`} type="text" value={bio} onChange={(e) => setBio(e.target.value)} autoComplete="off" maxLength={280} />
        <LeakNotice text={bio} leak={leak} field={`${id}-b`} />
      </div>
      <p className="fine pw-device">{t.deviceNote}</p>
      {error && <p className="callout callout-notice" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={!ok || busy} aria-busy={busy}>
        {busy ? t.creating : t.create}
      </button>
    </form>
  )
}

/** One image the person chose: the file as it will leave, its preview and the description she may write. */
type Picked = { key: string; prepared: Prepared; preview: string; alt: string }
/** An image that did not get attached after the post was out: its position in the post (0 to 3) and why. */
type Missing = { index: number; picked: Picked; reason: string }
export type Progress =
  | { step: 'prepare' | 'post' }
  | { step: 'upload' | 'attach'; n: number; total: number }
  | { step: 'checkVideo' | 'poster' | 'attachVideo' }
  | { step: 'video'; pct: number | null }
  | null

/** What the composer is doing right now, in words ("Enviando imagem 2 de 3", "Enviando o vídeo: 40%"). Empty when it is idle. */
export function progressLabel(p: Progress, c: AttachTexts['composer'], vc?: VideoTexts['composer']): string {
  if (p === null) return ''
  if (p.step === 'video') return !vc ? c.posting : p.pct === null ? vc.uploadingPlain : fill(vc.uploading, { pct: String(p.pct) })
  if (p.step === 'checkVideo') return vc?.checking ?? c.preparing
  if (p.step === 'poster') return vc?.uploadingPoster ?? c.posting
  if (p.step === 'attachVideo') return vc?.attaching ?? c.posting
  if (!('n' in p)) return p.step === 'prepare' ? c.preparing : c.posting
  return fill(p.step === 'upload' ? c.uploading : c.attaching, { n: String(p.n), total: String(p.total) })
}

/** The type and body of what the box publishes, by mode. */
function writeOf(mode: WriteMode, text: string): [string, Record<string, unknown>] {
  if (mode.kind === 'reply') return ['resposta', { alvo: mode.alvo, texto: text }]
  if (mode.kind === 'forum') return ['resposta-forum', { topico: mode.topico, em: mode.em, cita: null, texto: text }]
  return ['postagem', { texto: text, topicos: [] }]
}

const previewOf = (p: Prepared) => URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: 'image/jpeg' }))
const forget = (p: Picked) => URL.revokeObjectURL(p.preview)

/** One video the person chose: the cleaned file, its poster (or null when this browser could not draw it) and her description. */
type PickedVideo = { clean: CleanVideo; poster: Prepared | null; posterUrl: string | null; alt: string }
const forgetVideo = (v: PickedVideo) => {
  if (v.posterUrl) URL.revokeObjectURL(v.posterUrl)
}

/** Why a picked video does not go, in words, with the numbers that passed the limit. */
export function videoPickProblem(r: VideoRefusal, vc: VideoTexts['composer'], lang: string): string {
  const s = vc.errors[r.reason]
  if (r.reason === 'big') return fill(s, { mb: formatMegabytes(r.bytes ?? 0, lang) })
  if (r.reason === 'long') return fill(s, { s: String(Math.round((r.durationMs ?? 0) / 1000)) })
  if (r.reason === 'dims') return fill(s, { w: String(r.width ?? 0), h: String(r.height ?? 0) })
  return s
}

const LIMIT_CODES = new Set(['limite_de_taxa', 'limite', 'autorizacao_esgotada'])

/**
 * A refusal of the relay on a video (the upload or the `video` object), in words; a limit says when it unblocks. Null for a code
 * that is not about the video: the caller keeps its own sentence.
 */
export function videoRefusal(e: unknown, vr: VideoTexts['refusals'], ar: AttachTexts['refusals'], lang: string): string | null {
  const code = e instanceof PersonError ? e.code : ''
  const wait = waitOf(e)
  const when = wait === null ? ar.later : ar.unlocksIn.replace('{espera}', formatWait(wait, lang))
  if (LIMIT_CODES.has(code)) return `${vr.rate} ${when}`
  if (code === 'conta_nova') return `${vr.young} ${when}`
  if (code === 'rele_indisponivel') return `${vr.unavailable} ${when}`
  const fixed: Record<string, keyof VideoTexts['refusals']> = {
    cota_de_midia: 'quota', midia_recusada: 'refused', limite_de_estrutura: 'structure', video_grande: 'big', video_longo: 'long',
    dimensoes_grandes: 'dims', formato_nao_aceito: 'codec', video_invalido: 'invalid', hash_divergente: 'invalid',
  }
  return fixed[code] ? vr[fixed[code]] : null
}

/** The video that did not get attached after the post was out: what to send again and why it failed. */
type MissingVideo = { post: string; receipt: VideoReceipt; poster: string | null; picked: PickedVideo; reason: string }

/**
 * A forum refusal in words, with what unblocks it: join the community (`join`: the box can do it), a wait after joining, a ban, a
 * locked topic. Null for any other code: the caller keeps its own sentence.
 */
export function forumRefusal(e: unknown, rt: EditTexts['reply'], at: AttachTexts['refusals'], lang: string, access: 'aberta' | 'moderada' | 'fechada'): { text: string; join: boolean } | null {
  const code = e instanceof PersonError ? e.code : ''
  if (code === 'nao_e_membro') return access === 'fechada' ? { text: rt.joinClosed, join: false } : { text: rt.joinNeeded, join: true }
  if (code === 'banido') return { text: rt.banned, join: false }
  if (code === 'trancado') return { text: rt.locked, join: false }
  if (code === 'em_carencia') {
    const wait = waitOf(e)
    return { text: `${rt.wait} ${wait === null ? at.later : at.unlocksIn.replace('{espera}', formatWait(wait, lang))}`, join: false }
  }
  return null
}

function Composer({ t, at, leak, id, lang, st, nome: name, media, mode, rt, vt }: { t: PersonTexts; at: AttachTexts; leak: Leak; id: string; lang: string; st: PersonState; nome: string; media: boolean; mode: WriteMode; rt?: EditTexts['reply']; vt?: VideoTexts }) {
  const c = at.composer
  const vc = vt?.composer
  const router = useRouter()
  // the texts of the reply box, only when replying (narrows `rt` for the screen below)
  const rtx = mode.kind !== 'post' ? rt : undefined
  const replying = rtx !== undefined
  const max = MAX_TEXT[mode.kind]
  const [joinOffer, setJoinOffer] = useState(false)
  const [text, setText] = useState('')
  const [images, setImages] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [done, setDone] = useState<'published' | 'recovered' | 'recoveredVideo' | 'joinPending' | null>(null)
  const [partial, setPartial] = useState<{ post: string; total: number; missing: Missing[] } | null>(null)
  const [clip, setClip] = useState<PickedVideo | null>(null)
  const [partialVideo, setPartialVideo] = useState<MissingVideo | null>(null)
  const held = useRef<Picked[]>([])
  const heldVideo = useRef<PickedVideo[]>([])
  const leaks = useMemo(() => (text ? findLeaks(text).length > 0 : false), [text])
  const altStops = [...images.map((i) => i.alt), ...(clip ? [clip.alt] : [])].some((alt) => altProblem(alt) !== null || findLeaks(alt).length > 0)
  const videoRefusalText = (x: unknown) => (vt ? videoRefusal(x, vt.refusals, at.refusals, lang) : null) ?? refusal(x, 'images')
  const ok = text.trim().length > 0 && text.length <= max && !leaks && !altStops
  const refusal = (x: unknown, counted: Counted) => message(t, x, { t: at.refusals, lang, counted })

  // the previews are object URLs: whatever is still held when the composer leaves the page is released
  useEffect(() => {
    held.current = [...images, ...(partial?.missing.map((m) => m.picked) ?? [])]
  }, [images, partial])
  useEffect(() => {
    heldVideo.current = [...(clip ? [clip] : []), ...(partialVideo ? [partialVideo.picked] : [])]
  }, [clip, partialVideo])
  useEffect(
    () => () => {
      held.current.forEach(forget)
      heldVideo.current.forEach(forgetVideo)
    },
    [],
  )

  /** One video: the size and the container are checked before the file is read whole, then it is cleaned and its poster drawn. */
  async function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || busy || !vc || images.length > 0 || clip) return
    setPickError(null)
    setDone(null)
    setBusy(true)
    setProgress({ step: 'checkVideo' })
    try {
      const r = await prepareVideo(file)
      if (!r.ok) return setPickError(videoPickProblem(r, vc, lang))
      const poster = await drawPoster(r.bytes, VIDEO_MIME[r.format]).catch(() => null)
      setClip({ clean: r, poster, posterUrl: poster ? previewOf(poster) : null, alt: '' })
    } catch {
      setPickError(vc.errors.broken)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  function removeVideo() {
    if (clip) forgetVideo(clip)
    setClip(null)
    setPickError(null)
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length || busy) return
    setPickError(null)
    setDone(null)
    setBusy(true)
    setProgress({ step: 'prepare' })
    const room = ATTACH_MAX - images.length
    let problem: keyof AttachTexts['composer']['errors'] | null = files.length > room ? 'tooMany' : null
    const added: Picked[] = []
    for (const file of files.slice(0, room)) {
      try {
        // format by the first bytes, animation and size are checked before the browser decodes anything
        const refused = await checkPickedFile(file)
        if (refused) {
          problem = refused
          continue
        }
        const prepared = await prepareFile(file)
        if ([...images, ...added].some((x) => x.prepared.hash === prepared.hash)) problem = 'repeated'
        else added.push({ key: prepared.hash, prepared, preview: previewOf(prepared), alt: '' })
      } catch (x) {
        problem = x instanceof Error && x.message === 'too_big' ? 'tooHeavy' : 'broken'
      }
    }
    setImages((cur) => [...cur, ...added].slice(0, ATTACH_MAX))
    setProgress(null)
    setBusy(false)
    if (problem) setPickError(c.errors[problem])
  }

  function remove(key: string) {
    images.filter((x) => x.key === key).forEach(forget)
    setImages((cur) => cur.filter((x) => x.key !== key))
    setPickError(null)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    setPickError(null)
    setDone(null)
    const sending = images
    const sendingVideo = clip
    const stop = (why: string) => {
      setError(why)
      setProgress(null)
      setBusy(false)
    }
    // 1. every file first: a refusal of format, size or limit happens before anything is published. The video and its poster go
    // first; a poster the relay refuses does not hold the video back (it goes without one)
    let receipt: VideoReceipt | null = null
    let poster: string | null = null
    if (sendingVideo && vc) {
      setProgress({ step: 'video', pct: null })
      try {
        receipt = await uploadVideo(sendingVideo.clean, (f) => setProgress({ step: 'video', pct: Math.round(f * 100) }))
      } catch (x) {
        return stop(`${vc.uploadFailed} ${videoRefusalText(x)}`)
      }
      if (sendingVideo.poster) {
        setProgress({ step: 'poster' })
        try {
          await uploadMedia(sendingVideo.poster)
          poster = sendingVideo.poster.hash
        } catch {
          poster = null
        }
      }
    }
    for (const [i, im] of sending.entries()) {
      setProgress({ step: 'upload', n: i + 1, total: sending.length })
      try {
        await uploadMedia(im.prepared)
      } catch (x) {
        return stop(`${fill(c.uploadFailed, { n: String(i + 1) })} ${refusal(x, 'images')}`)
      }
    }
    // 2. the post (or the reply)
    let post: string
    setProgress({ step: 'post' })
    setJoinOffer(false)
    try {
      post = (await publish(...writeOf(mode, text.trim()))).id
    } catch (x) {
      const forum = mode.kind === 'forum' && rt ? forumRefusal(x, rt, at.refusals, lang, mode.acesso) : null
      if (forum?.join) setJoinOffer(true)
      return stop(x instanceof PersonError && x.code === 'vazamento' ? leak.chave : forum ? forum.text : refusal(x, 'posts'))
    }
    setText('')
    // 3. one `imagem` object per image, in order. The post is out: an image that fails does not take it back
    const missing: Missing[] = []
    for (const [i, im] of sending.entries()) {
      setProgress({ step: 'attach', n: i + 1, total: sending.length })
      try {
        await publishAttachment(im.prepared, post, i, im.alt)
        forget(im)
      } catch (x) {
        missing.push({ index: i, picked: im, reason: refusal(x, 'images') })
      }
    }
    setImages([])
    // 3b. the `video` object, with the numbers exactly as the relay answered the upload
    let videoMissing: MissingVideo | null = null
    if (sendingVideo && receipt) {
      setProgress({ step: 'attachVideo' })
      try {
        await publishVideo(receipt, post, poster, sendingVideo.alt)
        forgetVideo(sendingVideo)
      } catch (x) {
        videoMissing = { post, receipt, poster, picked: sendingVideo, reason: videoRefusalText(x) }
      }
      setClip(null)
    }
    setProgress(null)
    setBusy(false)
    if (videoMissing) setPartialVideo(videoMissing)
    else if (missing.length) setPartial({ post, total: sending.length, missing })
    else setDone('published')
    // a reply shows up in the conversation right away (the site forgot its short read cache when she published)
    if (replying) router.refresh()
  }

  /**
   * "Join the community and reply": an open community takes her at once, then the reply goes; a moderated one gets a join request,
   * and the box says she replies once it is accepted.
   */
  async function joinAndSend(e: React.MouseEvent) {
    if (mode.kind !== 'forum' || busy) return
    setBusy(true)
    setError(null)
    let result: unknown
    try {
      result = ((await publish('comunidade-adesao', { comunidade: mode.comunidade, acao: 'entrar' })) as { resultado?: unknown }).resultado
    } catch (x) {
      // already a member, or the request is already there: the reply decides
      if (!(x instanceof PersonError && x.code === 'ja_existe')) {
        setBusy(false)
        setJoinOffer(false)
        const forum = rt ? forumRefusal(x, rt, at.refusals, lang, mode.acesso) : null
        return setError(forum ? forum.text : refusal(x, 'posts'))
      }
    }
    setJoinOffer(false)
    setBusy(false)
    if (result === 'pendente') return setDone('joinPending')
    await send(e as unknown as React.FormEvent)
  }

  /** "Try again" for the images that did not get attached: the same position in the same post. */
  async function retry() {
    if (!partial || busy) return
    setBusy(true)
    const still: Missing[] = []
    for (const [k, m] of partial.missing.entries()) {
      setProgress({ step: 'attach', n: k + 1, total: partial.missing.length })
      try {
        try {
          await publishAttachment(m.picked.prepared, partial.post, m.index, m.picked.alt)
        } catch (x) {
          // the relay keeps an upload for one hour: after that the file goes again, then the object
          if (!(x instanceof PersonError) || x.code !== 'midia_ausente') throw x
          await uploadMedia(m.picked.prepared)
          await publishAttachment(m.picked.prepared, partial.post, m.index, m.picked.alt)
        }
        forget(m.picked)
      } catch (x) {
        // `ja_existe`: the first try did reach the relay and only the answer was lost, so the image is there
        if (x instanceof PersonError && x.code === 'ja_existe') forget(m.picked)
        else still.push({ ...m, reason: refusal(x, 'images') })
      }
    }
    setProgress(null)
    setBusy(false)
    if (still.length) return setPartial({ ...partial, missing: still })
    setPartial(null)
    setDone('recovered')
  }

  /** "Try again" for the video that did not get attached: the same post; after an hour the relay forgot the upload, so it goes again. */
  async function retryVideo() {
    if (!partialVideo || busy) return
    setBusy(true)
    const m = partialVideo
    try {
      try {
        setProgress({ step: 'attachVideo' })
        await publishVideo(m.receipt, m.post, m.poster, m.picked.alt)
      } catch (x) {
        if (!(x instanceof PersonError) || x.code !== 'midia_ausente') throw x
        setProgress({ step: 'video', pct: null })
        const receipt = await uploadVideo(m.picked.clean, (f) => setProgress({ step: 'video', pct: Math.round(f * 100) }))
        let poster: string | null = null
        if (m.picked.poster) {
          setProgress({ step: 'poster' })
          poster = await uploadMedia(m.picked.poster).then(() => m.picked.poster!.hash, () => null)
        }
        setProgress({ step: 'attachVideo' })
        await publishVideo(receipt, m.post, poster, m.picked.alt)
      }
      forgetVideo(m.picked)
      setPartialVideo(null)
      setDone('recoveredVideo')
    } catch (x) {
      // `ja_existe`: the first try did reach the relay and only the answer was lost, so the video is there
      if (x instanceof PersonError && x.code === 'ja_existe') {
        forgetVideo(m.picked)
        setPartialVideo(null)
        setDone('recoveredVideo')
      } else setPartialVideo({ ...m, reason: videoRefusalText(x) })
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  function giveUpVideo() {
    if (partialVideo) forgetVideo(partialVideo.picked)
    setPartialVideo(null)
    setDone('published')
  }

  function giveUp() {
    partial?.missing.forEach((m) => forget(m.picked))
    setPartial(null)
    setDone('published')
  }

  const progressText = progressLabel(progress, c, vc)
  const full = images.length >= ATTACH_MAX
  const needsText = (images.length > 0 || clip !== null) && text.trim().length === 0
  // images OR one video: choosing one hides the other's button
  const offerImages = media && clip === null
  const offerVideo = vc !== undefined && images.length === 0 && clip === null
  const pct = progress?.step === 'video' ? progress.pct : null
  // checking a picked file is not sending: the button keeps saying "Publish"
  const sendingNow = busy && progress?.step !== 'prepare' && progress?.step !== 'checkVideo'

  return (
    <form className="box box-pad pw-box form-proposal compact" onSubmit={send}>
      <div className="field">
        <label htmlFor={`${id}-t`}>{rtx ? rtx.label : t.composerLabel}</label>
        <textarea
          id={`${id}-t`}
          rows={3}
          value={text}
          placeholder={rtx ? rtx.placeholder : t.composerPlaceholder}
          onChange={(e) => {
            setText(e.target.value)
            setDone(null)
          }}
          maxLength={max}
          aria-describedby={needsText ? `${id}-tr` : undefined}
        />
        <LeakNotice text={text} leak={leak} field={`${id}-t`} />
        {needsText && (
          <p id={`${id}-tr`} className="fine pw-needs-text">
            {clip && vc ? vc.textRequired : c.textRequired}
          </p>
        )}
      </div>
      {media && images.length > 0 && (
        <ul className="pw-previews" aria-label={c.chosen}>
          {images.map((im, i) => {
            const field = `${id}-a-${im.key.slice(0, 12)}`
            return (
              <li key={im.key} className="pw-preview">
                <div className="pw-preview-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the bytes that will leave, from this device */}
                  <img src={im.preview} alt="" width={im.prepared.width} height={im.prepared.height} />
                  <button type="button" className="pw-preview-remove" aria-label={fill(c.remove, { n: String(i + 1) })} onClick={() => remove(im.key)} disabled={busy}>
                    <span className="pw-preview-remove-dot">
                      <IcClose width={16} height={16} />
                    </span>
                  </button>
                </div>
                <div className="pw-preview-alt">
                  <label htmlFor={field}>{fill(c.altLabel, { n: String(i + 1) })}</label>
                  <input
                    id={field}
                    type="text"
                    value={im.alt}
                    placeholder={c.altPlaceholder}
                    maxLength={ATTACH_ALT_MAX}
                    autoComplete="off"
                    disabled={busy}
                    aria-invalid={altProblem(im.alt) !== null || undefined}
                    onChange={(e) => setImages((cur) => cur.map((x) => (x.key === im.key ? { ...x, alt: e.target.value } : x)))}
                  />
                  <LeakNotice text={im.alt} leak={leak} field={field} />
                  {altProblem(im.alt) === 'url' && (
                    <p className="field-error" role="alert">
                      {c.errors.altUrl}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {clip && vc && (
        <div className="pw-preview pw-preview-video" role="group" aria-label={vc.chosen}>
          <div className="pw-preview-photo pw-video-cover">
            {clip.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the poster this device drew from the video that will leave
              <img src={clip.posterUrl} alt={vc.posterAlt} width={clip.poster?.width} height={clip.poster?.height} />
            ) : (
              <span className="pw-video-no-cover" aria-hidden>
                <IcVideo width={28} height={28} />
              </span>
            )}
            <span className="pw-video-time" aria-hidden>
              {formatDuration(clip.clean.durationMs)}
            </span>
            <button type="button" className="pw-preview-remove" aria-label={vc.remove} onClick={removeVideo} disabled={busy}>
              <span className="pw-preview-remove-dot">
                <IcClose width={16} height={16} />
              </span>
            </button>
          </div>
          <div className="pw-preview-alt">
            <p className="fine pw-video-summary">{fill(vc.summary, { duracao: formatDuration(clip.clean.durationMs), tamanho: formatMegabytes(clip.clean.bytes.length, lang) })}</p>
            {!clip.posterUrl && <p className="fine pw-video-note">{vc.noPoster}</p>}
            <label htmlFor={`${id}-va`}>{vc.altLabel}</label>
            <input
              id={`${id}-va`}
              type="text"
              value={clip.alt}
              placeholder={vc.altPlaceholder}
              maxLength={ATTACH_ALT_MAX}
              autoComplete="off"
              disabled={busy}
              aria-invalid={altProblem(clip.alt) !== null || undefined}
              onChange={(e) => {
                const alt = e.target.value
                setClip((cur) => (cur ? { ...cur, alt } : cur))
              }}
            />
            <LeakNotice text={clip.alt} leak={leak} field={`${id}-va`} />
            {altProblem(clip.alt) === 'url' && (
              <p className="field-error" role="alert">
                {c.errors.altUrl}
              </p>
            )}
          </div>
        </div>
      )}
      {(offerImages || offerVideo) && (
        <div className={`pw-attach${offerVideo ? ' pw-attach-double' : ''}`}>
          {offerImages && (
            <label className="btn btn-secondary btn-small pw-attach-button" data-desligado={full || busy || undefined}>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pick} className="reader-only" disabled={full || busy} aria-describedby={`${id}-ah`} />
              <IcCamera width={20} height={20} />
              {c.attach}
            </label>
          )}
          {offerVideo && vc && (
            <label className="btn btn-secondary btn-small pw-attach-button" data-desligado={busy || undefined}>
              <input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" onChange={pickVideo} className="reader-only" disabled={busy} aria-describedby={`${id}-vh`} />
              <IcVideo width={20} height={20} />
              {vc.attach}
            </label>
          )}
          {offerImages && (
            <p id={`${id}-ah`} className="fine pw-attach-help">
              {c.attachHelp}
            </p>
          )}
          {offerVideo && vc && (
            <p id={`${id}-vh`} className="fine pw-attach-help">
              {vc.attachHelp}
            </p>
          )}
        </div>
      )}
      {pickError && (
        <p className="callout callout-notice" role="alert">
          {pickError}
        </p>
      )}
      <div className="pw-foot">
        <span className="fine">{fill(t.writingAs, { nome: name, handle: st.handle ?? '' })}</span>
        <button type="submit" className="btn btn-primary btn-small" disabled={!ok || busy} aria-busy={busy}>
          {rtx ? (sendingNow ? rtx.sending : rtx.send) : sendingNow ? t.publishing : t.publish}
        </button>
      </div>
      <p className="fine pw-progress" role="status" aria-live="polite">
        {progressText}
      </p>
      {progress?.step === 'video' && pct !== null && <progress className="pw-bar" max={100} value={pct} aria-hidden />}
      {error && (
        <div className="callout callout-notice pw-refusal" role="alert">
          <p>{error}</p>
          {joinOffer && rtx && (
            <button type="button" className="btn btn-primary btn-small" onClick={joinAndSend} disabled={busy} aria-busy={busy}>
              {busy ? rtx.joining : rtx.join}
            </button>
          )}
        </div>
      )}
      {partial && (
        <div className="callout callout-notice pw-partial" role="alert">
          <p>
            {partial.missing.length === 1
              ? fill(c.partialOne, { n: String(partial.missing[0].index + 1) })
              : fill(c.partialMany, { lista: new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(partial.missing.map((m) => String(m.index + 1))) })}
          </p>
          <ul className="pw-missing-list">
            {partial.missing.map((m) => (
              <li key={m.picked.key}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the bytes that did not go, from this device */}
                <img src={m.picked.preview} alt="" width={m.picked.prepared.width} height={m.picked.prepared.height} />
                <span>
                  <strong>{fill(at.gallery.position, { n: String(m.index + 1), total: String(partial.total) })}</strong> {m.reason}
                </span>
              </li>
            ))}
          </ul>
          <div className="pw-partial-buttons">
            <button type="button" className="btn btn-primary btn-small" onClick={retry} disabled={busy} aria-busy={busy}>
              {busy ? c.retrying : c.retry}
            </button>
            <button type="button" className="btn btn-calm btn-small" onClick={giveUp} disabled={busy}>
              {c.giveUp}
            </button>
            {!replying && <Link href={`/${lang}/p/${partial.post}`}>{t.seeProfile}</Link>}
          </div>
        </div>
      )}
      {partialVideo && vc && (
        <div className="callout callout-notice pw-partial" role="alert">
          <p>{vc.partial}</p>
          <ul className="pw-missing-list">
            <li>
              {partialVideo.picked.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the poster of the video that did not go, from this device
                <img src={partialVideo.picked.posterUrl} alt="" width={partialVideo.picked.poster?.width} height={partialVideo.picked.poster?.height} />
              ) : (
                <span className="pw-video-no-cover pw-missing-video" aria-hidden>
                  <IcVideo width={22} height={22} />
                </span>
              )}
              <span>{partialVideo.reason}</span>
            </li>
          </ul>
          <div className="pw-partial-buttons">
            <button type="button" className="btn btn-primary btn-small" onClick={retryVideo} disabled={busy} aria-busy={busy}>
              {busy ? c.retrying : c.retry}
            </button>
            <button type="button" className="btn btn-calm btn-small" onClick={giveUpVideo} disabled={busy}>
              {c.giveUp}
            </button>
            {!replying && <Link href={`/${lang}/p/${partialVideo.post}`}>{t.seeProfile}</Link>}
          </div>
        </div>
      )}
      {done && (
        <p className="callout callout-ok" role="status">
          {done === 'joinPending' && rtx ? (
            rtx.joinPending
          ) : rtx ? (
            done === 'recoveredVideo' && vc ? vc.recovered : done === 'recovered' ? c.recovered : rtx.sent
          ) : (
            <>
              {done === 'recoveredVideo' && vc ? vc.recovered : done === 'recovered' ? c.recovered : t.published} <Link href={`/${lang}/r/${st.handle}`}>{t.seeProfile}</Link>
            </>
          )}
        </p>
      )}
    </form>
  )
}
