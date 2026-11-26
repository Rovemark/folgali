export const TABS = ['mural', 'depoimentos', 'amigos', 'grupos', 'postagens'] as const
export type Tab = (typeof TABS)[number]
export const isTab = (x: unknown): x is Tab => (TABS as readonly string[]).includes(x as string)
