export const ABAS = ['mural', 'depoimentos', 'amigos', 'grupos', 'postagens'] as const
export type Aba = (typeof ABAS)[number]
export const ehAba = (x: unknown): x is Aba => (ABAS as readonly string[]).includes(x as string)
