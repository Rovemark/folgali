import RovemarkSymbol from './RovemarkSymbol'

/**
 * The only way to join folgali: the Rovemark account. With no configured destination (FOLGALI_ROVEMARK_SIGNIN_URL), the button
 * appears disabled, with "coming soon" and the explanation; it never leads to a place that does not exist. No Google or Apple here.
 */
export default function RovemarkButton({ href, rotulo: label, emBreve: comingSoon, emBreveTexto: comingSoonText, outline = false }: { href: string | null; rotulo: string; emBreve: string; emBreveTexto: string; outline?: boolean }) {
  const kind = `btn btn-grande btn-largo btn-rovemark${outline ? ' btn-rovemark-contorno' : ''}`
  if (href) {
    return (
      <a href={href} className={kind}>
        <RovemarkSymbol />
        <span>{label}</span>
      </a>
    )
  }
  return (
    <div className="rovemark-soon">
      <button type="button" className={kind} disabled aria-describedby="rovemark-em-breve">
        <RovemarkSymbol />
        <span>{label}</span>
        <span className="pill-soon">{comingSoon}</span>
      </button>
      <p id="rovemark-em-breve" className="fine">{comingSoonText}</p>
    </div>
  )
}
