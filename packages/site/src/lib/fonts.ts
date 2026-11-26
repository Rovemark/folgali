// folgali fonts: Nunito (headings, the heavy rounded grotesque that talks to the logo), Manrope (running text)
// and IBM Plex Mono (code and numbers). All three under SIL Open Font License 1.1, copied into the repository: the build does not
// depend on the network and the page calls no third-party font (test/site-privacy.test.ts).
import localFont from 'next/font/local'

export const nunito = localFont({
  src: [{ path: '../fonts/nunito-variable.ttf', weight: '200 1000', style: 'normal' }],
  variable: '--fonte-titulo',
  display: 'swap',
})

export const manrope = localFont({
  src: [{ path: '../fonts/manrope-variable.ttf', weight: '200 800', style: 'normal' }],
  variable: '--fonte-corpo',
  display: 'swap',
})

export const mono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--fonte-mono',
  display: 'swap',
})

/** Classes the `<html>` receives to expose the three font variables. */
export const fontClasses = `${nunito.variable} ${manrope.variable} ${mono.variable}`
