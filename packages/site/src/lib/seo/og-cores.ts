// The Open Graph image is drawn outside the browser (satori), where CSS variables do not exist. These are the folgali colors (Ivory,
// Graphite and Hangar Blue, from `src/app/globals.css`) in hexadecimal (the background is the same light `themeColor` as the layout). If the visual identity changes, this file is what
// follows: the `og-cores` test checks that each value is still a valid color and readable over the background.
export const OG = {
  fundo: '#F4F1EA',
  painel: '#FFFFFF',
  linha: '#D9D4C8',
  tinta: '#111318',
  softInk: '#4A4D55',
  acao: '#3455E8',
} as const

/** WCAG contrast between two #rrggbb colors. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16)
    const channel = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
