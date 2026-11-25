import Link from 'next/link'

/**
 * O logotipo oficial da folgali: a Luna de capacete de aviador na rede azul, bebendo limonada, e a palavra "folgali"
 * sempre em minúsculas. Duas versões, sem quadro nem fundo atrás: `logo-principal.webp` no tema claro e `logo-escuro.webp`
 * (palavra em marfim, rede azul clara) no tema escuro. O CSS mostra uma de cada vez; a escura nunca vai sobre fundo claro.
 * Arte da Rovemark (public/marca/folgali, fora da AGPL).
 */
export default function Marca({ lang, rotulo = 'folgali', href, altura = 44 }: { lang: string; rotulo?: string; href?: string; altura?: number }) {
  return (
    <Link href={href ?? `/${lang}`} className="marca" aria-label={rotulo}>
      {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
      <img src="/marca/folgali/logo-principal.webp" alt="" width={Math.round((altura * 770) / 283)} height={altura} className="marca-logo marca-claro" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
      <img src="/marca/folgali/logo-escuro.webp" alt="" width={Math.round((altura * 900) / 324)} height={altura} className="marca-logo marca-escuro" decoding="async" />
    </Link>
  )
}
