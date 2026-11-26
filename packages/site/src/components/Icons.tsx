import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (children: ReactNode, p: P) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...p}>
    {children}
  </svg>
)

/** The needle of the brand: the thread leaves the bottom and makes a loop. */
export const Needle = (p: P) =>
  base(
    <>
      <path d="M5 19 19 5" />
      <ellipse cx="17.2" cy="6.8" rx="1.1" ry="2.5" transform="rotate(45 17.2 6.8)" />
      <path d="M5 19c-2 .5-3.2-.6-2.6-2 .8-1.8 3.6-.6 2.4 1.2" strokeDasharray="1.6 2.2" />
    </>,
    p,
  )
/** Home: a newspaper page (wide title and two columns). */
export const IcHome = (p: P) =>
  base(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M7 9h10M7 13h4.2M12.8 13H17M7 16h4.2M12.8 16H17" />
    </>,
    p,
  )
export const IcTimeline = (p: P) =>
  base(
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <path d="M6 8.6v6.8" />
      <path d="M12 6h8M12 18h8M12 12h5" />
    </>,
    p,
  )
export const IcDiscover = (p: P) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.6 8.4-2 5.2-5.2 2 2-5.2z" />
    </>,
    p,
  )
export const IcSearch = (p: P) =>
  base(
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.9-4.9" />
    </>,
    p,
  )
export const IcApprove = (p: P) =>
  base(
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" strokeDasharray="3 2.4" />
      <path d="m8.2 12.3 2.8 2.8 4.9-5.6" />
    </>,
    p,
  )
export const IcRover = (p: P) =>
  base(
    <>
      <path d="M5 21v-2.5C5 15 8 13 12 13s7 2 7 5.5V21" />
      <circle cx="12" cy="8" r="4.5" />
      <circle cx="10.2" cy="7.7" r=".6" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="7.7" r=".6" fill="currentColor" stroke="none" />
    </>,
    p,
  )
export const IcHeart = (p: P) => base(<path d="M12 20.2S3.5 15 3.5 8.9C3.5 6.2 5.6 4.5 7.9 4.5c1.7 0 3.2.9 4.1 2.4.9-1.5 2.4-2.4 4.1-2.4 2.3 0 4.4 1.7 4.4 4.4 0 6.1-8.5 11.3-8.5 11.3z" />, p)
export const IcLamp = (p: P) =>
  base(
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
    </>,
    p,
  )
export const IcBalloon = (p: P) => base(<path d="M20 11.5c0 3.9-3.6 7-8 7-1 0-1.9-.2-2.8-.4L4.5 20l1.2-3.7C4.4 15.1 4 13.4 4 11.5c0-3.9 3.6-7 8-7s8 3.1 8 7z" />, p)
export const IcPlus = (p: P) => base(<><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></>, p)
export const IcFlag = (p: P) => base(<><path d="M5 21V4" /><path d="M5 5c3-2 5.5 2 9 0 1.8-1 3.2-.8 5 0v8c-1.8-.8-3.2-1-5 0-3.5 2-6-2-9 0" /></>, p)
export const IcTrash = (p: P) => base(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12.2c.1.5.5.8 1 .8h8c.5 0 .9-.3 1-.8L18 7M9 7V4.5h6V7" /></>, p)
export const IcCheck = (p: P) => base(<path d="m5 12.5 4.5 4.5L19 7.5" />, p)
export const IcX = (p: P) => base(<path d="M6 6l12 12M18 6 6 18" />, p)
export const IcInfo = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".5" fill="currentColor" /></>, p)
export const IcAlert = (p: P) => base(<><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></>, p)
export const IcLock = (p: P) => base(<><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>, p)
export const IcPen = (p: P) => base(<><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m14.5 7.5 3 3" /></>, p)
export const IcSun = (p: P) => base(<><circle cx="12" cy="12" r="4" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>, p)
export const IcMoon = (p: P) => base(<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z" />, p)
export const IcGlobe = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3c2.6 2.4 3.9 5.4 3.9 9s-1.3 6.6-3.9 9c-2.6-2.4-3.9-5.4-3.9-9S9.4 5.4 12 3z" /></>, p)
export const IcArrow = (p: P) => base(<path d="M19 12H5M11 6l-6 6 6 6" />, p)
export const IcShield = (p: P) => base(<><path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6z" /><path d="m9 12 2.2 2.2L15.2 10" /></>, p)
