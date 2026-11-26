// Types for scripts/legal-structure.mjs (used by test/legal.test.tsx).
export const PAGES: readonly string[]
export function structure(md: string): Record<string, unknown>
export function differences(en: string, translation: string): string[]
