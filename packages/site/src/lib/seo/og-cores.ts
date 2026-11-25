// A imagem Open Graph é desenhada fora do navegador (satori), onde variáveis CSS não existem. Estas são as cores da folgali (Marfim,
// Grafite e Azul Hangar, de `src/app/globals.css`) em hexadecimal (o fundo é o mesmo `themeColor` claro do layout). Se a identidade visual mudar, é este arquivo que
// acompanha: o teste `og-cores` confere que cada valor continua sendo uma cor válida e legível sobre o fundo.
export const OG = {
  fundo: '#F4F1EA',
  painel: '#FFFFFF',
  linha: '#D9D4C8',
  tinta: '#111318',
  tintaSuave: '#4A4D55',
  acao: '#3455E8',
} as const

/** Contraste WCAG entre duas cores #rrggbb. */
export function contraste(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16)
    const canal = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
