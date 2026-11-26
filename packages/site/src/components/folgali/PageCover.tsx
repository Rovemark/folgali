import Photo from '@/components/folgali/Photo'
import { FELT, PAGE_ART, SCENES, type FeltKey, type SceneKey } from '@/lib/folgali/scenes'

/**
 * The illustrated header of a public page: a wide scene photo with a felt icon sitting on its lower edge. Purely decorative (the
 * page title right below says what the page is), so both images carry `alt=""`. Pages pick the art by route id in PAGE_ART.
 */
export default function PageCover({ scene, felt, priority = true }: { scene: SceneKey; felt: FeltKey; priority?: boolean }) {
  return (
    <figure className="page-cover" aria-hidden>
      <Photo foto={SCENES[scene]} alt="" className="page-cover-photo" prioridade={priority} sizes="(min-width: 1100px) 680px, 100vw" />
      {/* eslint-disable-next-line @next/next/no-img-element -- static felt icon, already a small webp */}
      <img src={FELT[felt]} alt="" width={320} height={320} className="page-cover-felt" decoding="async" />
    </figure>
  )
}

/** The cover of a route id, or nothing when the page has no art assigned. */
export function CoverOf({ id }: { id: string }) {
  const art = PAGE_ART[id]
  return art ? <PageCover scene={art.scene} felt={art.felt} /> : null
}
