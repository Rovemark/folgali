import type { Photo as TPhoto } from '@/lib/folgali/demo'

/**
 * Time-off photo, with the demonstration alt text or its own. Loads at once by default (the fold changes with the width and a
 * lazy photo above it delays the first paint); `late` only for what is always well below the fold.
 */
export default function Photo({ foto: photo, alt, className = '', prioridade: priority = false, late = false, sizes }: { foto: TPhoto; alt?: string; className?: string; prioridade?: boolean; late?: boolean; sizes?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static art already compressed to webp; the Next optimizer does not help here
    <img
      src={photo.src}
      alt={alt ?? photo.alt}
      width={photo.largura}
      height={photo.altura}
      className={`photo ${className}`}
      loading={late && !priority ? 'lazy' : 'eager'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      sizes={sizes}
    />
  )
}
