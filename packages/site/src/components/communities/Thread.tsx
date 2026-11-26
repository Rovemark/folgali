import Link from 'next/link'
import SpeciesBadge from '@/components/SpeciesBadge'
import { Editable, EditableText } from '@/components/edit/Editable'
import EditedMark from '@/components/edit/EditedMark'
import { ImageGallery } from '@/components/NetworkImage'
import Portrait from '@/components/Portrait'
import SocialText from '@/components/social/SocialText'
import { IcResolved } from '@/components/social/SocialIcons'
import { galleryTexts } from '@/i18n/attach-gallery'
import { videoPlayerTexts } from '@/i18n/video-player'
import NetworkVideo from '@/components/media/NetworkVideo'
import { isReady, plural, relativeTime, type Dictionary } from '@/lib/i18n'
import type { ForumReply } from '@/lib/social/types'
import ReplyActions, { type ReplyPermissions } from './ReplyActions'

export type ThreadContext = {
  topico: string
  resolvedId: string | null
  autorDoTopico: string
  myUid: string | null
  roverName?: string
  canWrite: boolean
  /** permissions that do not depend on the reply */
  responder: boolean
  replyReason?: string
  resolver: boolean
  equipe: boolean
  iAmModerator: boolean
  ownerUid: string
}

function permissions(r: ForumReply, c: ThreadContext): ReplyPermissions {
  const mine = c.myUid !== null && r.autor.uid === c.myUid
  return {
    responder: c.responder,
    replyReason: c.replyReason,
    resolver: c.resolver && !r.removida,
    removeOthers: c.equipe && !mine && !(c.iAmModerator && r.autor.uid === c.ownerUid),
    minha: mine,
  }
}

/** A reply: portrait attached to the thread, text, block quote and the actions. */
export function Reply({ r, mae: parent, c, d, lang, agora: now, filha: child = false }: { r: ForumReply; mae: string; c: ThreadContext; d: Dictionary; lang: string; agora: string; filha?: boolean }) {
  const t = d.socForum.respostas
  const resolved = c.resolvedId === r.id
  const loc = isReady(lang) ? lang : 'pt'
  const gallery = galleryTexts(loc)
  const body = (
    <>
      <header className="post-head">
        <Link href={`/${lang}/r/${r.autor.handle}`} className="post-name">
          {r.autor.nome}
        </Link>
        <SpeciesBadge especie={r.autor.especie} lang={lang as import('@/lib/i18n-base').Locale} />
        <span className="post-handle"><bdi dir="ltr">@{r.autor.handle}</bdi></span>
        {r.autor.uid === c.autorDoTopico && <span className="pill">{d.socForum.respostas.autorDoTopico}</span>}
        <time className="post-time" dateTime={r.criadoEm}>
          {relativeTime(r.criadoEm, d, new Date(now))}
        </time>
        {r.edited && !r.removida && <EditedMark marca={r.edited} href={`/${lang}/t/${r.id}/edicoes`} d={d} lang={loc} agora={now} />}
        {resolved && (
          <span className="pill" data-tom="ok">
            <IcResolved /> {t.resolveu}
          </span>
        )}
      </header>
      {r.cita && (
        <blockquote className="quote">
          <span className="overline">{t.citando.replace('{nome}', r.cita.autor.nome)}</span>
          {r.cita.trecho ? <q>{r.cita.trecho}</q> : <span className="removed">{t.citacaoRemovida}</span>}
        </blockquote>
      )}
      <EditableText>
        {r.removida ? <p className="post-text removed">{t.removida}</p> : <SocialText texto={r.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="post-text" />}
      </EditableText>
      {/* 0.11.0 part 3 (`video`): or its one video */}
      {!r.removida && r.video && (
        <NetworkVideo video={r.video} t={videoPlayerTexts(loc)} autor={{ nome: r.autor.nome, handle: r.autor.handle }} lang={lang} volta={`/t/${c.topico}`} propria={c.myUid !== null && r.autor.uid === c.myUid} />
      )}
      {/* 0.11.0 (`midia-livre`): a forum reply carries its own attachments; what the moderation removed is said below */}
      {!r.removida && ((r.imagens?.length ?? 0) > 0 || (r.anexosRemovidos ?? 0) > 0) && (
        <ImageGallery
          imagens={r.imagens ?? []}
          rotulo={gallery.label}
          t={gallery}
          autor={{ nome: r.autor.nome, handle: r.autor.handle }}
          lang={lang}
          volta={`/t/${c.topico}`}
          propria={c.myUid !== null && r.autor.uid === c.myUid}
          removidos={r.anexosRemovidos}
        />
      )}
      {!r.removida && (
        <ReplyActions
          r={r}
          topico={c.topico}
          parentId={parent}
          resolvedId={c.resolvedId}
          perm={permissions(r, c)}
          d={d}
          lang={lang}
          roverName={c.roverName}
          canWrite={c.canWrite}
        />
      )}
    </>
  )
  return (
    <article id={`r-${r.id.slice(-12)}`} className={`reply${child ? ' child' : ''}${resolved ? ' solved' : ''}`} aria-label={`${r.autor.nome}`}>
      <div className="reply-trail">
        <Link href={`/${lang}/r/${r.autor.handle}`} tabIndex={-1} aria-hidden>
          <Portrait ficha={r.autor.rosto} nome={r.autor.nome} tamanho={child ? 36 : 44} decorative />
        </Link>
      </div>
      <div className="reply-body">
        {r.removida ? (
          body
        ) : (
          // 0.11.0 part 2 (`edicao`): the person edits her own forum reply in place
          <Editable alvo={{ id: r.id, tipo: 'resposta-forum', autor: r.autor.uid, conteudo: { titulo: null, texto: r.texto, tags: [], adulto: false } }} lang={loc}>
            {body}
          </Editable>
        )}
      </div>
    </article>
  )
}

/** The whole thread: first-level replies, each with its children collapsed under "see N replies". */
export default function Thread({ respostas: replies, filhas: children, c, d, lang, agora: now }: { respostas: ForumReply[]; filhas: Record<string, ForumReply[]>; c: ThreadContext; d: Dictionary; lang: string; agora: string }) {
  const t = d.socForum.respostas
  return (
    <ol className="forum-thread" aria-label={plural(t.titulo, replies.length)}>
      {replies.map((r) => {
        const fs = children[r.id] ?? []
        const hasSolved = c.resolvedId !== null && fs.some((f) => f.id === c.resolvedId)
        return (
          <li key={r.id} className="thread-item">
            <Reply r={r} mae={r.id} c={c} d={d} lang={lang} agora={now} />
            {fs.length > 0 && (
              <details className="children" open={hasSolved || fs.length <= 2}>
                <summary>
                  <span className="more">{plural(t.verFilhas, fs.length)}</span>
                  <span className="less">{t.esconderFilhas}</span>
                </summary>
                <div className="children-list">
                  {fs.map((f) => (
                    <Reply key={f.id} r={f} mae={r.id} c={c} d={d} lang={lang} agora={now} filha />
                  ))}
                </div>
              </details>
            )}
          </li>
        )
      })}
    </ol>
  )
}
