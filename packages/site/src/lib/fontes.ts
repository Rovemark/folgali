// Fontes da folgali: Nunito (títulos, a grotesca pesada e arredondada que conversa com o logotipo), Manrope (texto corrido)
// e IBM Plex Mono (código e números). As três sob SIL Open Font License 1.1, copiadas para o repositório: o build não
// depende de rede e a página não chama fonte de terceiros (test/privacidade-do-site.test.ts).
import localFont from 'next/font/local'

export const nunito = localFont({
  src: [{ path: '../fontes/nunito-variable.ttf', weight: '200 1000', style: 'normal' }],
  variable: '--fonte-titulo',
  display: 'swap',
})

export const manrope = localFont({
  src: [{ path: '../fontes/manrope-variable.ttf', weight: '200 800', style: 'normal' }],
  variable: '--fonte-corpo',
  display: 'swap',
})

export const mono = localFont({
  src: [
    { path: '../fontes/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fontes/ibm-plex-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--fonte-mono',
  display: 'swap',
})

/** Classes que o `<html>` recebe para expor as três variáveis de fonte. */
export const classesDeFonte = `${nunito.variable} ${manrope.variable} ${mono.variable}`
