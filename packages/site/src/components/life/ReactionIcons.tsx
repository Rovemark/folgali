import type { Reaction } from './texts'

// The five reactions, as plush little faces in the palette colors (the colors come from the CSS, through classes; no color code here).
// Drawn for 24 px; decorative: the name of the reaction goes in the button label.

const Face = ({ children }: { children: React.ReactNode }) => (
  <>
    <circle cx="12" cy="12" r="11" className="ri-face" />
    <ellipse cx="6.4" cy="14.4" rx="2" ry="1.3" className="ri-cheek" />
    <ellipse cx="17.6" cy="14.4" rx="2" ry="1.3" className="ri-cheek" />
    {children}
  </>
)

const DRAWINGS: Record<Reaction, React.ReactNode> = {
  curtir: (
    <>
      <circle cx="12" cy="12" r="11" className="ri-bg-blue" />
      <path d="M7.2 11h2.2v6.4H7.2zM10.4 17.4V11l2.6-4.4c.9 0 1.6.8 1.4 1.7l-.5 2.3h3c.9 0 1.6.9 1.3 1.8l-1.3 4.2c-.2.5-.7.8-1.2.8z" className="ri-white" />
    </>
  ),
  amei: (
    <>
      <circle cx="12" cy="12" r="11" className="ri-bg-pink" />
      <path d="M12 18.2s-5.6-3.4-5.6-7.3a3 3 0 0 1 5.6-1.5 3 3 0 0 1 5.6 1.5c0 3.9-5.6 7.3-5.6 7.3Z" className="ri-white" />
    </>
  ),
  haha: (
    <Face>
      <path d="M7.4 9.4 9.4 10.4 7.4 11.4M16.6 9.4l-2 1 2 1" className="ri-stroke" />
      <path d="M7.6 13.4h8.8a4.4 4.4 0 0 1-8.8 0Z" className="ri-mouth" />
    </Face>
  ),
  uau: (
    <Face>
      <circle cx="8.6" cy="9.6" r="1.25" className="ri-eye" />
      <circle cx="15.4" cy="9.6" r="1.25" className="ri-eye" />
      <ellipse cx="12" cy="15.2" rx="1.9" ry="2.4" className="ri-mouth" />
    </Face>
  ),
  abraco: (
    <Face>
      <path d="M7.4 10.2a1.6 1.6 0 0 1 3 0M13.6 10.2a1.6 1.6 0 0 1 3 0" className="ri-stroke" />
      <path d="M12 19.6s-3.2-1.9-3.2-4.1a1.7 1.7 0 0 1 3.2-.8 1.7 1.7 0 0 1 3.2.8c0 2.2-3.2 4.1-3.2 4.1Z" className="ri-heart" />
      <path d="M4.2 15.6c1.8 1.6 3.4 1.9 4.6 1.4M19.8 15.6c-1.8 1.6-3.4 1.9-4.6 1.4" className="ri-arm" />
    </Face>
  ),
}

export default function ReactionIcon({ r, tamanho: size = 24 }: { r: Reaction; tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="reaction-icon" data-r={r} aria-hidden focusable="false">
      {DRAWINGS[r]}
    </svg>
  )
}
