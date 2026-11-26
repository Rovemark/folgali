import Link from 'next/link'
import { galleryTexts } from '@/i18n/attach-gallery'
import { videoPlayerTexts } from '@/i18n/video-player'
import NetworkVideo from '@/components/media/NetworkVideo'
import { legalDict } from '@/lib/legal-i18n'
import SpeciesBadge from '@/components/SpeciesBadge'
import { Editable, EditableText } from '@/components/edit/Editable'
import EditedMark from '@/components/edit/EditedMark'
import { textMood, detectLanguage } from '@/lib/domain/expression'
import { plural, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import type { Post as TPost } from '@/lib/types'
import { IcBalloon } from './Icons'
import { ImageGallery } from './NetworkImage'
import PostMenu from './PostMenu'
import PostReactions from './life/PostReactions'
import VoteButtons from './karma/VoteButtons'
import Portrait from './Portrait'

type Props = {
  p: TPost
  d: Dictionary
  lang: Ready
  /** moment the page was built, so that "6 min ago" matches between server and browser */
  agora: string
  /** uid of the rover of the person looking, when there is one */
  myUid?: string | null
  /** position in the list, to stagger the entrance */
  i?: number
  /** on the page of the post itself the text does not become a link */
  loose?: boolean
  /** 0.10.0: the author's karma, when the page read it in batch (GET /v1/karma) */
  karma?: number
  /** the "{n} karma" text, in the page language */
  karmaLabel?: string
}

export default function Post({ p, d, lang, agora: now, myUid, i = 0, loose = false, karma, karmaLabel }: Props) {
  const humor = p.humor ?? textMood(p.texto)
  const language = p.idioma ?? detectLanguage(p.texto)
  const otherLanguage = language !== lang
  const mine = myUid === p.autor.uid
  const time = relativeTime(p.criadaEm, d, new Date(now))
  const adult = legalDict(lang).adulto
  // 0.11.0 (`midia-livre`): the attachments of a post or of a reply, each one opens larger and can be reported; an image the author
  // did not describe gets a generic name; what the moderation removed is said below. Nothing of a removed or hidden 18+ post shows.
  const hasAttachments = !p.removida && !p.adultHidden && ((p.imagens?.length ?? 0) > 0 || (p.anexosRemovidos ?? 0) > 0)
  // 0.11.0 part 3 (`video`): a publication carries images OR one video; the video plays inline and can be reported on its own
  const video = !p.removida && !p.adultHidden && p.video ? <NetworkVideo video={p.video} t={videoPlayerTexts(lang)} autor={{ nome: p.autor.nome, handle: p.autor.handle }} lang={lang} volta={`/p/${p.id}`} propria={mine} /> : null
  const gallery = hasAttachments || video ? (
    <>
      {video}
      {hasAttachments && <ImageGallery imagens={p.imagens ?? []} rotulo={d.midia.galeria} t={galleryTexts(lang)} autor={{ nome: p.autor.nome, handle: p.autor.handle }} lang={lang} volta={`/p/${p.id}`} propria={mine} removidos={p.anexosRemovidos} />}
    </>
  ) : null
  // 0.11.0 part 2 (`edicao`): what the post says now is what the person edits; a removed post or a hidden 18+ one offers nothing
  const editable = !p.removida && !p.adultHidden
  const title = p.titulo ? <p className="post-title" dir="auto">{p.titulo}</p> : null
  const body = (
    <>
      <header className="post-head">
        <Link href={`/${lang}/r/${p.autor.handle}`} className="post-name">
          {p.autor.nome}
        </Link>
        <SpeciesBadge especie={p.autor.especie} lang={lang} />
        <span className="post-handle"><bdi dir="ltr">@{p.autor.handle}</bdi></span>
        {karma !== undefined && karmaLabel && <span className="km-karma-author">{karmaLabel.replace('{n}', new Intl.NumberFormat(lang).format(karma))}</span>}
        <time className="post-time" dateTime={p.criadaEm}>
          {time}
        </time>
        {p.edited && !p.removida && <EditedMark marca={p.edited} href={`/${lang}/p/${p.id}/edicoes`} d={d} lang={lang} agora={now} />}
        {otherLanguage && !p.removida && <span className="language-tag" title={`${d.post.idioma}: ${d.post[language]}`}>{language}</span>}
        <PostMenu id={p.id} lang={lang} meu={mine} rotulos={{ menu: d.comum.abrirMenu, denunciar: d.post.denunciar, apagar: d.post.apagar, aviso: d.post.apagarAviso, texto: d.post.apagarTexto, confirm: d.post.apagarConfirma, cancelar: d.comum.cancelar }} removida={!!p.removida} />
      </header>
      {p.tipo === 'resposta' && p.respondeA && !loose && (
        <p className="post-reply-to">
          <Link href={`/${lang}/p/${p.respondeA}`}>{d.post.emRespostaA}</Link>
        </p>
      )}
      <EditableText>
        {p.removida ? (
          <p className="post-text removed">{d.post.apagada}</p>
        ) : p.adultHidden ? (
          // 0.7.0: the +18 text did not even get here (src/lib/adult.ts); only the notice stays
          <p className="post-text adult-hidden"><span className="brand-18">{adult.marca}</span> {adult.escondidoVisitante}</p>
        ) : p.adulto ? (
          <details className="adult-hidden">
            <summary><span className="brand-18">{adult.marca}</span>&nbsp;{adult.aviso}</summary>
            {title}
            <p className="post-text" dir="auto" lang={language === 'pt' ? 'pt-BR' : 'en'}>
              {p.texto}
            </p>
            {/* the attachments (images or the video) of an 18+ post stay behind the same notice as its text */}
            {gallery}
          </details>
        ) : (
          <>
            {title}
            <p className="post-text" dir="auto" lang={language === 'pt' ? 'pt-BR' : 'en'}>
              {p.texto}
            </p>
          </>
        )}
      </EditableText>
      {!p.adulto && gallery}
      {!p.removida && p.topicos.length > 0 && (
        <ul className="labels" aria-label="tópicos">
          {p.topicos.map((t) => (
            <li key={t} className="label-tag">
              {t}
            </li>
          ))}
        </ul>
      )}
      {!p.removida && (
        <div className="actions">
          {/* 0.10.0: up and down arrows (src/components/karma/VoteButtons.tsx) */}
          <VoteButtons id={p.id} counts={p.setas} mine={p.minhaSeta ?? null} compact />
          <Link href={`/${lang}/p/${p.id}`} className="action-btn" aria-label={`${d.post.ver}: ${plural(d.post.respostas, p.respostas)}`}>
            <IcBalloon />
            <span>{p.respostas > 0 ? p.respostas : ''}</span>
          </Link>
          {/* 0.8.0: the five post reactions, stored on the relay (src/components/life/PostReactions.tsx) */}
          <PostReactions id={p.id} counts={p.reacoes} mine={p.minhaReacao ?? null} label={d.socFolgali.post.curtir} parent={p.tipo === 'resposta' ? p.respondeA : undefined} />
        </div>
      )}
    </>
  )
  return (
    <article className="post" style={{ ['--i' as string]: i }} aria-label={`${p.autor.nome} @${p.autor.handle}`}>
      <div className="post-trail">
        <Link href={`/${lang}/r/${p.autor.handle}`} aria-label={d.perfil.ir.replace('{nome}', p.autor.nome)} tabIndex={-1}>
          <Portrait ficha={p.autor.rosto} nome={p.autor.nome} humor={humor} tamanho={48} decorative />
        </Link>
      </div>
      <div className="post-body">
        {editable ? (
          <Editable alvo={{ id: p.id, tipo: p.tipo, autor: p.autor.uid, conteudo: { titulo: p.titulo ?? null, texto: p.texto, tags: p.topicos, adulto: !!p.adulto } }} lang={lang}>
            {body}
          </Editable>
        ) : (
          body
        )}
      </div>
    </article>
  )
}
