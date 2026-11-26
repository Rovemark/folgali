import type { ReactNode, SVGProps } from 'react'

// folgali icons: 1.9 px stroke, round corners, drawn for 24 px. Decorative (aria-hidden): the name comes from the text beside them.
type P = SVGProps<SVGSVGElement>

const base = (children: ReactNode, p: P) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...p}>
    {children}
  </svg>
)

export const IcHouse = (p: P) => base(<><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.6V19a1 1 0 0 0 1 1h3.8v-5.4h3.4V20h3.8a1 1 0 0 0 1-1V9.6" /></>, p)
export const IcFriends = (p: P) => base(<><circle cx="9" cy="8.5" r="3.4" /><path d="M2.8 19.5c.6-3.4 3.2-5.4 6.2-5.4s5.6 2 6.2 5.4" /><circle cx="16.6" cy="9.4" r="2.6" /><path d="M16.4 14.2c2.6 0 4.4 1.7 4.9 4.4" /></>, p)
export const IcGroup = (p: P) => base(<><circle cx="12" cy="7.6" r="2.9" /><circle cx="5.6" cy="9.6" r="2.2" /><circle cx="18.4" cy="9.6" r="2.2" /><path d="M7.2 19.4c.4-3 2.4-4.8 4.8-4.8s4.4 1.8 4.8 4.8" /><path d="M2.6 18.6c.3-2.2 1.6-3.5 3.4-3.6M21.4 18.6c-.3-2.2-1.6-3.5-3.4-3.6" /></>, p)
export const IcBalloon = (p: P) => base(<path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 19 17h-8.2L6 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z" />, p)
export const IcBell = (p: P) => base(<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>, p)
export const IcCalendar = (p: P) => base(<><rect x="3.5" y="5" width="17" height="15" rx="2.2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>, p)
export const IcFlag = (p: P) => base(<><path d="M5.5 21V4" /><path d="M5.5 4.5h11l-2 4 2 4h-11" /></>, p)
export const IcMemory = (p: P) => base(<><path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8" /><path d="M3.5 3.8v4h4" /><path d="M12 7.8V12l3 2" /></>, p)
export const IcMoment = (p: P) => base(<><circle cx="12" cy="12" r="8.5" strokeDasharray="4.5 2.2" /><path d="m10.2 8.8 5 3.2-5 3.2Z" /></>, p)
// 0.10.0: the ranking (a podium)
export const IcRanking = (p: P) => base(<><path d="M9 20V9.5h6V20" /><path d="M3.5 20v-6.5H9M15 20v-4.5h5.5V20" /><path d="M2.5 20h19" /><path d="m12 3.4.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z" /></>, p)
export const IcDiscover = (p: P) => base(<><circle cx="12" cy="12" r="8.5" /><path d="m15.4 8.6-2 4.8-4.8 2 2-4.8Z" /></>, p)
export const IcAgent = (p: P) => base(<><rect x="5" y="8" width="14" height="11" rx="3.5" /><path d="M12 8V4.6" /><circle cx="12" cy="3.6" r="1" /><circle cx="9.4" cy="13.2" r="1.1" /><circle cx="14.6" cy="13.2" r="1.1" /><path d="M2.8 12.5v3M21.2 12.5v3" /></>, p)
export const IcRover = (p: P) => base(<><path d="M6 19c-1.4-1.2-2-3-2-5.2C4 9.2 7.6 5 12 5s8 4.2 8 8.8c0 2.2-.6 4-2 5.2Z" /><circle cx="9.5" cy="12.4" r=".9" fill="currentColor" /><circle cx="14.5" cy="12.4" r=".9" fill="currentColor" /><path d="M10.6 15.2c.8.6 2 .6 2.8 0" /></>, p)
export const IcSearch = (p: P) => base(<><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.6 15.6 4.6 4.6" /></>, p)
export const IcLike = (p: P) => base(<><path d="M7.5 10.5v9h-3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" /><path d="M7.5 10.5 11 4.3a2 2 0 0 1 3.4 1.6l-.7 3.6h4.9a2 2 0 0 1 2 2.4l-1.3 6a2 2 0 0 1-2 1.6H7.5" /></>, p)
export const IcComment = IcBalloon
export const IcShare = (p: P) => base(<><path d="M13.5 5.5 20 11.5l-6.5 6v-3.6C8.6 13.9 5.8 15.6 4 19c.4-5.6 3.6-9.4 9.5-9.9Z" /></>, p)
export const IcHeart = (p: P) => base(<path d="M12 20s-7.5-4.4-8.4-9.6C3 7.2 5 4.8 7.8 4.8c1.7 0 3.2 1 4.2 2.4 1-1.4 2.5-2.4 4.2-2.4 2.8 0 4.8 2.4 4.2 5.6C19.5 15.6 12 20 12 20Z" />, p)
export const IcCoffee = (p: P) => base(<><path d="M4.5 9.5h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z" /><path d="M16.5 11h1.3a2.2 2.2 0 0 1 0 4.4h-1.6" /><path d="M8.5 3.5c-.8 1 .8 2-.1 3M12.5 3.5c-.8 1 .8 2-.1 3" /></>, p)
export const IcCamera = (p: P) => base(<><path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2.3l1.5-2.2h5.4L16.2 7h2.3A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" /><circle cx="12" cy="13" r="3.4" /></>, p)
// 0.11.0 part 3: a video camera, for "attach video"
export const IcVideo = (p: P) => base(<><rect x="3.5" y="6.5" width="12" height="11" rx="2" /><path d="m15.5 10.6 5-3v8.8l-5-3" /></>, p)
export const IcDice = (p: P) => base(<><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="8.6" cy="8.6" r="1" fill="currentColor" /><circle cx="15.4" cy="15.4" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="15.4" cy="8.6" r="1" fill="currentColor" /><circle cx="8.6" cy="15.4" r="1" fill="currentColor" /></>, p)
export const IcMusic = (p: P) => base(<><path d="M9 18V6l10-2v12" /><circle cx="6.6" cy="18" r="2.4" /><circle cx="16.6" cy="16" r="2.4" /></>, p)
export const IcPin = (p: P) => base(<><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>, p)
export const IcOnline = (p: P) => base(<><path d="M3.5 9.5a12 12 0 0 1 17 0" /><path d="M6.6 12.8a7.6 7.6 0 0 1 10.8 0" /><path d="M9.7 16a3.2 3.2 0 0 1 4.6 0" /><circle cx="12" cy="19" r=".9" fill="currentColor" /></>, p)
export const IcCopy = (p: P) => base(<><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>, p)
export const IcSend = (p: P) => base(<path d="M20.5 3.5 10.6 13.4M20.5 3.5l-6.3 17-3.6-7.1-7.1-3.6Z" />, p)
export const IcClose = (p: P) => base(<path d="M6 6l12 12M18 6 6 18" />, p)
export const IcLeft = (p: P) => base(<path d="m14.5 5.5-6.5 6.5 6.5 6.5" />, p)
export const IcRight = (p: P) => base(<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />, p)
export const IcPlus = (p: P) => base(<path d="M12 5v14M5 12h14" />, p)
export const IcMinus = (p: P) => base(<path d="M5 12h14" />, p)
export const IcShield = (p: P) => base(<><path d="M12 3.5 19 6v5.4c0 4.4-3 7.7-7 9.1-4-1.4-7-4.7-7-9.1V6Z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></>, p)
export const IcVerified = (p: P) => base(<><circle cx="12" cy="12" r="8.5" /><path d="m8.2 12.2 2.6 2.6 5-5.2" /></>, p)
export const IcPen = (p: P) => base(<><path d="m14.5 5.5 4 4L8 20H4v-4Z" /><path d="m12.5 7.5 4 4" /></>, p)
export const IcInfo = (p: P) => base(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.2M12 7.8v.2" /></>, p)
export const IcDots = (p: P) => base(<><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></>, p)
export const IcStar = (p: P) => base(<path d="m12 3.8 2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7Z" />, p)
export const IcGift = (p: P) => base(<><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5" /><path d="M12 8C10.5 4.5 7 4.2 7 6.2S10 8 12 8Zm0 0c1.5-3.5 5-3.8 5-1.8S14 8 12 8Z" /></>, p)
export const IcPersonPlus = (p: P) => base(<><circle cx="9.5" cy="8.5" r="3.4" /><path d="M3.2 19.5c.6-3.4 3.2-5.4 6.3-5.4 1.6 0 3 .5 4.1 1.4" /><path d="M18 13v6M15 16h6" /></>, p)
export const IcSmile = (p: P) => base(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2" /><path d="M9 9.8v.4M15 9.8v.4" /></>, p)
export const IcFire = (p: P) => base(<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.4 2 1.4 3 2.4 3.3C12 6.8 13.4 4.6 15.6 3c-.4 3 1 4.8 2 6.3.9 1.4 1.4 2.8 1.4 4.6C19 18 16 21 12 21Z" />, p)
