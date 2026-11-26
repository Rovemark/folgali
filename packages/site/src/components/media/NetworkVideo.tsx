// 0.11.0 part 3 (`video`): the video of a post, a reply, a forum topic or a forum reply. Rules this component keeps:
//   - the player is the browser's own (`controls`), never plays by itself, asks only for the metadata until she presses play
//     (`preload="metadata"`), and plays inline on a phone (`playsinline`);
//   - it always has an accessible name: the author's description, or "Video posted by ..." when she wrote none;
//   - the `src` and the `poster` are born only from checked hashes, on this site's domain (src/lib/videos.ts);
//   - the proportion is reserved before anything loads, and an upright video is capped in height so it does not take the whole screen;
//   - "Report video" points at the id of the `video` object, like an image's report; not on her own video.
// It renders on the server and in the browser alike (no state): the feed's "load more" draws it too.
import Link from 'next/link'
import type { VideoPlayerTexts } from '@/i18n/video-player'
import { formatDuration, thumbnailUrl, videoUrl, type NetworkVideo as TVideo } from '@/lib/videos'

type Props = {
  video: TVideo
  t: VideoPlayerTexts
  autor: { nome: string; handle: string }
  lang: string
  /** where the report page goes back to: an internal path, without the language (`/p/<id>`, `/t/<id>`) */
  volta?: string
  /** the reader's own video: no report entry */
  propria?: boolean
}

export default function NetworkVideo({ video, t, autor: author, lang, volta: back, propria: own = false }: Props) {
  const src = videoUrl(video)
  if (!src) return null
  const poster = thumbnailUrl(video.miniatura) ?? undefined
  const written = video.alt.trim()
  const name = written || t.genericAlt.replace('{nome}', author.nome)
  const report =
    !own && video.id
      ? `/${lang}/denunciar/${video.id}?tipo=video&de=${encodeURIComponent(author.handle)}${back ? `&volta=${encodeURIComponent(back)}` : ''}`
      : null
  const { largura: w, altura: h } = video
  return (
    <figure className="video-network" aria-label={t.label}>
      <div className="video-network-frame" style={{ aspectRatio: `${w} / ${h}`, maxInlineSize: `min(100%, calc(30rem * ${w} / ${h}))` }}>
        <video src={src} poster={poster} controls preload="metadata" playsInline width={w} height={h} aria-label={name} />
      </div>
      <figcaption className="video-network-foot">
        {written && (
          <span className="video-network-caption" dir="auto">
            {written}
          </span>
        )}
        <span className="fine video-network-duration">{t.duration.replace('{duracao}', formatDuration(video.duracaoMs))}</span>
        {report && (
          <Link href={report} className="fine video-network-report" prefetch={false}>
            {t.report}
          </Link>
        )}
      </figcaption>
    </figure>
  )
}
