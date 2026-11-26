import Link from 'next/link'

/**
 * The official folgali logo: Luna in an aviator helmet on the blue net, drinking lemonade, and the word "folgali"
 * always in lowercase. Two versions, with no frame or background behind: `logo-principal.webp` in the light theme and `logo-escuro.webp`
 * (word in ivory, light blue net) in the dark theme. The CSS shows one at a time; the dark one never goes on a light background.
 * Rovemark art (public/marca/folgali, outside the AGPL).
 */
export default function Brand({ lang, rotulo: label = 'folgali', href, altura: height = 44 }: { lang: string; rotulo?: string; href?: string; altura?: number }) {
  return (
    <Link href={href ?? `/${lang}`} className="brand" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand art */}
      <img src="/marca/folgali/logo-principal.webp" alt="" width={Math.round((height * 770) / 283)} height={height} className="brand-logo brand-light" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand art */}
      <img src="/marca/folgali/logo-escuro.webp" alt="" width={Math.round((height * 900) / 324)} height={height} className="brand-logo brand-dark" decoding="async" />
    </Link>
  )
}
