// The server action of Settings > Privacy (Rovemark's decision, 25/11/2026): 18+ is off by default, and turning it on needs the
// "I am 18 or older" box ticked on the same form. Without it nothing is saved and the page comes back with `?erro=maior`. Keeping 18+
// on, turning it off and changing only the AI-training choice need no confirmation.
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  pessoa: { id: 'p_lumi123456', nome: 'Ana Folga' } as null | { id: string; nome: string },
  prefs: { adulto: false, semTreino: false },
  gravar: vi.fn(),
  redirects: [] as string[],
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (u: string) => {
    h.redirects.push(u)
    throw new Error(`REDIRECT ${u}`)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/folgali/session', () => ({ currentPerson: async () => h.pessoa }))
vi.mock('@/lib/folgali/vault', async (original) => {
  const vault = await original<typeof import('@/lib/folgali/vault')>()
  return { ...vault, preferencesOf: () => h.prefs, savePreferences: h.gravar, recordConsent: vi.fn() }
})

import { savePreferencesAction } from '@/app/actions-account'

const form = (fields: Record<string, string>, lang = 'pt') => {
  const f = new FormData()
  f.set('lang', lang)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const save = async (f: FormData) => {
  await expect(savePreferencesAction(f)).rejects.toThrow('REDIRECT')
  return h.redirects.at(-1)
}

afterEach(() => {
  h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
  h.prefs = { adulto: false, semTreino: false }
  h.gravar.mockReset()
  h.redirects = []
})

describe('savePreferencesAction: turning 18+ on needs the age confirmed again', () => {
  it('18+ asked without the age box: nothing is saved, not even the training choice, and the page says why', async () => {
    expect(await save(form({ adulto: 'sim', semTreino: 'sim' }))).toBe('/pt/configuracoes/privacidade?erro=maior')
    expect(await save(form({ adulto: 'sim' }, 'en'))).toBe('/en/configuracoes/privacidade?erro=maior')
    expect(h.gravar).not.toHaveBeenCalled()
  })
  it('with the age box ticked it is saved, with the confirmation passed on to the store', async () => {
    expect(await save(form({ adulto: 'sim', confirmaMaior: 'sim' }))).toBe('/pt/configuracoes/privacidade?salvo=1')
    expect(h.gravar).toHaveBeenCalledWith('p_lumi123456', { adulto: true, semTreino: false, confirmaMaior: true })
  })
  it('only the training choice, keeping 18+ on, or turning 18+ off: no confirmation needed', async () => {
    expect(await save(form({ semTreino: 'sim' }))).toBe('/pt/configuracoes/privacidade?salvo=1')
    expect(h.gravar).toHaveBeenLastCalledWith('p_lumi123456', { adulto: false, semTreino: true, confirmaMaior: false })
    h.prefs = { adulto: true, semTreino: false }
    expect(await save(form({ adulto: 'sim' }))).toBe('/pt/configuracoes/privacidade?salvo=1')
    expect(h.gravar).toHaveBeenLastCalledWith('p_lumi123456', { adulto: true, semTreino: false, confirmaMaior: false })
    expect(await save(form({}))).toBe('/pt/configuracoes/privacidade?salvo=1')
    expect(h.gravar).toHaveBeenLastCalledWith('p_lumi123456', { adulto: false, semTreino: false, confirmaMaior: false })
  })
  it('signed out: back to the page, nothing saved', async () => {
    h.pessoa = null
    expect(await save(form({ adulto: 'sim', confirmaMaior: 'sim' }))).toBe('/pt/configuracoes/privacidade')
    expect(h.gravar).not.toHaveBeenCalled()
  })
})
