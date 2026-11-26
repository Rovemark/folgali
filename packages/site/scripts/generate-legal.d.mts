// Types for scripts/generate-legal.mjs (used by test/legal.test.tsx).
export const DOCUMENTS: ReadonlyArray<{ pagina: string; n: string }>
export const LANGUAGES: readonly string[]
export function publishable(rawValue: string, language: 'pt' | 'en'): string
export function withoutInternalNote(text: string): string
export function versionOf(rawValue: string): string
export function languageModule(language: string, texts: Record<string, string | null>): string
export function expected(): Map<string, string>
