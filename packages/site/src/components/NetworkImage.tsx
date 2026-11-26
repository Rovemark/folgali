/* eslint-disable @next/next/no-img-element -- the network image comes from the site itself (/midia/<hash>), with a known size; the Next optimizer does not help and would fetch on its own */
// 0.5.0: a network image (image portrait or post attachment). Rules this component guarantees:
//   - the image never appears without an accessible name: the author's alternative text or, since 0.11.0 (where the author may leave the text
//     empty), the generic name the screen passes ("Imagem publicada por ..."); with neither, the image does not appear;
//   - the `src` only comes from the checked hash (`/midia/<hash>.<ext>`, same domain); there is no address prop;
//   - width and height go on the <img> and the aspect ratio is reserved before loading: the page does not jump;
//   - loads on demand (`loading="lazy"`).
import type { GalleryTexts } from '@/i18n/attach-gallery'
import { imageUrl, type NetworkImage as TImage } from '@/lib/images'
import ZoomableGallery, { type ZoomableItem } from './media/ZoomableGallery'

type Props = {
  imagem: TImage
  className?: string
  /** the image is the content itself (attachment) or a portrait */
  papel?: 'anexo' | 'retrato'
  /** 0.11.0: the accessible name when the author wrote no alternative text */
  genericName?: string
}

/** The accessible name of an image: what the author wrote, or the generic name the screen gives. Empty when there is neither. */
export const imageName = (image: Pick<TImage, 'alt'>, generic?: string): string => (typeof image.alt === 'string' ? image.alt.trim() : '') || generic?.trim() || ''

export default function NetworkImage({ imagem: image, className = '', papel: role = 'anexo', genericName }: Props) {
  const src = imageUrl(image)
  const alt = imageName(image, genericName)
  if (!src || !alt) return null
  return (
    <span className={`imagem-rede imagem-${role} ${className}`.trim()} style={{ aspectRatio: `${image.largura} / ${image.altura}` }}>
      <img src={src} alt={alt} width={image.largura} height={image.altura} loading="lazy" decoding="async" />
    </span>
  )
}

type GalleryProps = {
  imagens: TImage[]
  rotulo: string
  /**
   * 0.11.0 (`midia-livre`): with the gallery texts, each image opens larger, an image with no description gets the generic name with the
   * author, each one has "Report image" (the id of its `imagem` object) and the note of what the moderation removed shows below.
   * Without them the gallery is the plain list of 0.5.0.
   */
  t?: GalleryTexts
  autor?: { nome: string; handle: string }
  lang?: string
  /** where the report page goes back to: an internal path, without the language (`/p/<id>`, `/t/<id>`) */
  volta?: string
  /** the reader's own images: no report entry */
  propria?: boolean
  /** 0.11.0: how many attachments the moderation removed from this publication */
  removidos?: number
}

/**
 * The quiet note under a gallery when the moderation removed attachments from the publication. 0.11.0 part 3: a publication carries
 * up to 4 images OR one video, and the relay counts both the same way; so one removed attachment with nothing left to show may have
 * been the video, and the note says "an attachment" (`vazia`). Two or more were images.
 */
export function RemovedAttachments({ n, t, vazia: empty = false }: { n: number; t: Pick<GalleryTexts, 'removedOne' | 'removedMany' | 'removedAttachment'>; vazia?: boolean }) {
  if (!(n > 0)) return null
  return <p className="gallery-removed fine">{n === 1 ? (empty ? t.removedAttachment : t.removedOne) : t.removedMany.replace('{n}', String(n))}</p>
}

/** The attachments of a publication (1 to 4), in a grid. */
export function ImageGallery({ imagens: images, rotulo: label, t, autor: author, lang, volta: back, propria: own = false, removidos: removed = 0 }: GalleryProps) {
  const generic = t && author ? t.genericAlt.replace('{nome}', author.nome) : undefined
  const valid = images.filter((i) => imageUrl(i) && imageName(i, generic)).slice(0, 4)
  const note = t ? <RemovedAttachments n={removed} t={t} vazia={valid.length === 0} /> : null
  if (!valid.length) return note
  if (!t) {
    return (
      <ul className="gallery" data-n={valid.length} aria-label={label}>
        {valid.map((i, k) => (
          <li key={`${i.hash}-${k}`}>
            <NetworkImage imagem={i} />
          </li>
        ))}
      </ul>
    )
  }
  const items: ZoomableItem[] = valid.map((i, k) => {
    const written = i.alt.trim()
    const report =
      !own && i.id && lang
        ? `/${lang}/denunciar/${i.id}?tipo=imagem${author ? `&de=${encodeURIComponent(author.handle)}` : ''}${back ? `&volta=${encodeURIComponent(back)}` : ''}`
        : undefined
    return { chave: `${i.id ?? i.hash}-${k}`, src: imageUrl(i)!, nome: imageName(i, generic), legenda: written || undefined, largura: i.largura, altura: i.altura, denuncia: report }
  })
  return (
    <>
      <ZoomableGallery itens={items} rotulo={label} t={t} />
      {note}
    </>
  )
}
