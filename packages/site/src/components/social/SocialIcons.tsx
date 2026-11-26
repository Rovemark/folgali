import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (children: ReactNode, p: P) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...p}>
    {children}
  </svg>
)

export const IcBell = (p: P) => base(<><path d="M6 17.5V11a6 6 0 0 1 12 0v6.5l1.5 1.5h-15z" /><path d="M10 21h4" /></>, p)
/** The patch: a stitched piece of cloth, the home of a community. */
export const IcGroup = (p: P) => base(<><rect x="3.5" y="4" width="17" height="16" rx="5" /><rect x="7" y="7.5" width="10" height="9" rx="3" strokeDasharray="2.2 2.2" /></>, p)
/** The plush label: a project or fan page. */
export const IcTag = (p: P) => base(<><path d="M4.5 6.5a2 2 0 0 1 2-2h8.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 0 2.8l-6.8 6.8a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1-.6-1.4z" /><circle cx="8.6" cy="8.6" r="1.1" fill="currentColor" stroke="none" /></>, p)
export const IcFriends = (p: P) => base(<><circle cx="9" cy="8.5" r="3.3" /><path d="M2.8 19.5v-1.4c0-2.4 2.8-4 6.2-4s6.2 1.6 6.2 4v1.4" /><path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8M18.6 14.6c1.7.6 2.8 1.8 2.8 3.5v1.4" /></>, p)
export const IcWall = (p: P) => base(<><path d="M5 4.5h14a1 1 0 0 1 1 1V15l-4.5 4.5H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" /><path d="M20 15h-4a.5.5 0 0 0-.5.5v4" /><path d="M8 9h8M8 12.5h5" /></>, p)
export const IcQuotes = (p: P) => base(<><path d="M10 7.5C7 8 5 10 5 13v3.5h5V12H7.3c.2-1.7 1.2-2.7 2.7-3z" /><path d="M19 7.5c-3 .5-5 2.5-5 5.5v3.5h5V12h-2.7c.2-1.7 1.2-2.7 2.7-3z" /></>, p)
export const IcMedal = (p: P) => base(<><circle cx="12" cy="9.5" r="5.5" /><path d="m9 14.2-1.5 6 4.5-2.3 4.5 2.3-1.5-6" /><path d="m10 9.6 1.5 1.5 2.6-2.8" /></>, p)
export const IcPin = (p: P) => base(<><path d="M9 4h6l-1 5.5 3.2 2.5v1.5H6.8V12L10 9.5z" /><path d="M12 13.5V20" /></>, p)
export const IcPadlock = (p: P) => base(<><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" /></>, p)
export const IcMod = (p: P) => base(<><path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6z" /><path d="M12 8.2v4.6M12 15.3v.1" /></>, p)
export const IcPoll = (p: P) => base(<><path d="M4 20h16" /><rect x="5.5" y="11" width="3.2" height="6.5" rx="1" /><rect x="10.4" y="6" width="3.2" height="11.5" rx="1" /><rect x="15.3" y="13" width="3.2" height="4.5" rx="1" /></>, p)
export const IcResolved = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="m8 12.4 2.9 2.9 5.2-5.8" /></>, p)
export const IcQuote = (p: P) => base(<><path d="M4 12h9.5a4.5 4.5 0 0 1 0 9H10" /><path d="m7.5 8.5-3.5 3.5 3.5 3.5" /></>, p)
export const IcSend = (p: P) => base(<><path d="M20.5 3.5 10 14" /><path d="m20.5 3.5-6.5 17-3-7-7-3z" /></>, p)
export const IcBlock = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></>, p)
export const IcMute = (p: P) => base(<><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="m16 9 5 6M21 9l-5 6" /></>, p)
export const IcInvite = (p: P) => base(<><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="m4.5 7.5 7.5 5.5 7.5-5.5" /></>, p)
export const IcClock = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>, p)
export const IcEdit = (p: P) => base(<><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m14.5 7.5 3 3" /></>, p)
export const IcMove = (p: P) => base(<><path d="M5 12h14M15 7l5 5-5 5" /></>, p)
export const IcTrend = (p: P) => base(<><path d="m3.5 16.5 5.5-5.5 3.5 3.5 7.5-8" /><path d="M15 6.5h5.5V12" /></>, p)
export const IcStar = (p: P) => base(<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" />, p)
export const IcBook = (p: P) => base(<><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14.5H6.5A1.5 1.5 0 0 0 5 20z" /><path d="M5 18.5V5.5M9 8h6M9 11.5h4" /></>, p)
