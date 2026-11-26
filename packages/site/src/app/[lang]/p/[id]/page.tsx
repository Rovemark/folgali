import type { Metadata } from 'next'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Post from '@/components/Post'
import { IcArrow } from '@/components/Icons'
import OpenPost from '@/components/folgali/OpenPost'
import { isObjectId } from '@/lib/domain/ids'
import { isTimeOffPost, timeOffPost } from '@/lib/folgali/demo'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { NetworkError } from '@/lib/types'
import { screenMeta } from '@/lib/seo/meta-screens'
import PersonWriter from '@/components/person/PersonWriter'
import { attachTexts } from '@/i18n/attach'
import { videoTexts } from '@/i18n/video'
import { editTexts } from '@/i18n/edit'
import { personTexts } from '@/i18n/person'
import { issuersReady } from '@/lib/folgali/issuers'
import { currentPerson } from '@/lib/folgali/session'
import { legalDict } from '@/lib/legal-i18n'
import { isDemo } from '@/lib/site'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/p/${id}`, dict(isReady(lang) ? lang : 'pt').post.conversa)
}

export default async function PostPage({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const { cliente: client, ponte: bridge } = getNetwork()
  // Time-off posts with a photo are still demonstration (the protocol has no photo on a public post with a threaded comment).
  if (isTimeOffPost(id) && client.modo === 'falso') {
    const pf = timeOffPost(id, new Date())
    if (!pf) notFound()
    return <OpenPost p={pf} d={d} lang={lang} agora={new Date()} />
  }
  if (!isObjectId(id)) notFound()
  let detail
  try {
    detail = gateAdult(await client.getObject(id), await canSeeAdult())
  } catch (e) {
    if (e instanceof NetworkError && (e.codigo === 'nao-encontrado' || e.codigo === 'invalido')) notFound()
    throw e
  }
  const me = await bridge.whoAmI()
  const now = new Date().toISOString()
  const { postagem: post, pai: parent, respostas: replies } = detail
  // 0.7.0: a person signed in with Rovemark replies here too, signed by the device (src/components/person/PersonWriter.tsx); a visitor
  // is invited to sign in. Only a post takes replies on this page (the conversation of a reply lives under its post).
  const login = !isDemo(client.modo) && issuersReady() !== null
  const person = login && (await currentPerson()) !== null
  const [freeMedia, withVideo] = person ? await Promise.all([client.suporta('midia-livre').catch(() => false), client.suporta('video').catch(() => false)]) : [false, false]
  const canReply = post.tipo === 'postagem' && !post.removida
  const et = editTexts(lang)
  return (
    <>
      <p style={{ marginBottom: 6 }}>
        <Link href={`/${lang}/linha`} className="btn btn-calm btn-small">
          <IcArrow width={20} height={20} />
          {d.comum.voltar}
        </Link>
      </p>
      <h1 className="reader-only">{d.post.conversa}</h1>
      <div className="thread-list">
        {parent && <Post p={parent} d={d} lang={lang} agora={now} myUid={me?.uid} />}
        <Post p={post} d={d} lang={lang} agora={now} myUid={me?.uid} loose />
      </div>
      <h2 className="overline" style={{ margin: '22px 0 0' }}>
        {d.post.respostasTitulo}
      </h2>
      {replies.length > 0 ? (
        <div className="thread-list" role="feed">
          {replies.map((r, i) => (
            <Post key={r.id} p={r} d={d} lang={lang} agora={now} myUid={me?.uid} i={i} loose />
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--tinta-3)', marginTop: 10 }}>{d.post.semRespostas}</p>
      )}
      {canReply && person && (
        <section className="pw-reply" aria-labelledby="pw-resposta-t">
          <h2 id="pw-resposta-t" className="overline">
            {et.reply.title}
          </h2>
          <PersonWriter t={personTexts(lang)} at={attachTexts(lang)} media={freeMedia} video={withVideo} vt={videoTexts(lang)} leak={legalDict(lang).vazamento} lang={lang} consentHref={`/${lang}/entrar`} mode={{ kind: 'reply', alvo: post.id }} rt={et.reply} />
        </section>
      )}
      {canReply && !person && (
        <div className="invite-reply">
          <p>{d.post.naoResponde}</p>
          {login && (
            <Link href={`/${lang}/entrar`} className="btn btn-primary btn-small">
              {et.reply.inviteLink}
            </Link>
          )}
        </div>
      )}
    </>
  )
}
