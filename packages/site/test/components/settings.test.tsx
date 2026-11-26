// Settings > Privacy (/configuracoes/privacidade), Rovemark's decision of 25/11/2026: the 18+ and AI-training choices left the
// sign-in screen and live here (LGPD art. 18, GDPR art. 21). Signed out: the sign-in prompt. Before the Terms: the way to accept them.
// Signed in and adult: both boxes with the stored choices (18+ off by default, with the "I am 18 or older" box to turn it on), the
// save button, the "saved" notice and the notice of a save that tried to turn 18+ on without confirming the age. The server action
// refuses that save (bottom of this file).
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  pessoa: null as null | { id: string; nome: string },
  aceite: null as null | { versao: string; data: string; maior: true },
  prefs: { adulto: false, semTreino: false },
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: h.notFound, usePathname: () => '/pt/configuracoes/privacidade', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/folgali/session', () => ({ currentPerson: async () => h.pessoa }))
vi.mock('@/lib/folgali/vault', () => ({ consentOf: () => h.aceite, preferencesOf: () => h.prefs }))
vi.mock('@/app/actions-account', () => ({ acceptTermsAction: vi.fn(), savePreferencesAction: vi.fn() }))

import PrivacySettings, { generateMetadata } from '@/app/[lang]/configuracoes/privacidade/page'
import { routePolicy } from '@/lib/seo/policy'
import { legalDict } from '@/lib/legal-i18n'
import { LOCALES } from '@/lib/i18n-base'

const params = (lang: string, saved?: string) => ({ params: Promise.resolve({ lang }), searchParams: Promise.resolve(saved ? { salvo: saved } : {}) })
const renderScreen = async (jsx: Promise<React.ReactElement>) => render(await jsx)
const CONSENT = { versao: 'folgali-termos-1.0', data: '2026-11-25T00:00:00.000Z', maior: true as const }

afterEach(() => {
  h.pessoa = null
  h.aceite = null
  h.prefs = { adulto: false, semTreino: false }
  document.body.innerHTML = ''
})

describe('/configuracoes/privacidade', () => {
  it('signed in and adult: 18+ comes unticked by default with the "I am 18 or older" box beside it, training not objected, one form', async () => {
    h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
    h.aceite = CONSENT
    await renderScreen(PrivacySettings(params('pt')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Configurações de privacidade')
    expect(screen.getByRole('checkbox', { name: /Mostrar conteúdo \+18/ })).not.toBeChecked()
    const confirm = screen.getByRole('checkbox', { name: /Confirmo que tenho 18 anos ou mais/ })
    expect(confirm).not.toBeChecked()
    expect(confirm).toHaveAttribute('name', 'confirmaMaior')
    expect(screen.getByRole('checkbox', { name: /Não usar o meu conteúdo para treinar IA/ })).not.toBeChecked()
    expect(screen.getByText(/Desligado por padrão/)).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Salvar escolhas' })
    const form = save.closest('form')!
    expect(form.querySelector('input[name="lang"]')).toHaveValue('pt')
    expect(form).toContainElement(confirm)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', '/pt/privacidade')
  })
  it('the stored choices show as they are (18+ on, training objected), no age box once on, and the "saved" notice after saving', async () => {
    h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
    h.aceite = CONSENT
    h.prefs = { adulto: true, semTreino: true }
    await renderScreen(PrivacySettings(params('pt', '1')))
    expect(screen.getByRole('checkbox', { name: /Mostrar conteúdo \+18/ })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /Confirmo que tenho 18 anos ou mais/ })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Não usar o meu conteúdo para treinar IA/ })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Escolhas salvas.')
  })
  it('a save that tried to turn 18+ on without the age box comes back with the notice, in the language', async () => {
    h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
    h.aceite = CONSENT
    await renderScreen(PrivacySettings({ params: Promise.resolve({ lang: 'en' }), searchParams: Promise.resolve({ erro: 'maior' }) }))
    expect(screen.getByRole('alert')).toHaveTextContent('To turn on 18+ content, also tick the box confirming you are 18 or older. Nothing was saved.')
    expect(screen.getByRole('checkbox', { name: /I confirm I am 18 or older/ })).not.toBeChecked()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('signed out: no boxes, only the sign-in prompt', async () => {
    await renderScreen(PrivacySettings(params('pt')))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('Entre com a sua conta Rovemark para mudar estas escolhas.')).toBeInTheDocument()
  })
  it('signed in before accepting the Terms: no boxes, a way to the acceptance screen', async () => {
    h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
    await renderScreen(PrivacySettings(params('en')))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'Confirm' })).toHaveAttribute('href', '/en/entrar')
  })
  it('never indexed, title in the language, unknown language is 404', async () => {
    expect(routePolicy('/pt/configuracoes/privacidade', true).index).toBe(false)
    expect(await generateMetadata(params('en'))).toMatchObject({ title: 'Privacy settings' })
    await expect(PrivacySettings(params('xx'))).rejects.toThrow('NOT_FOUND')
  })
  it('every language has the settings texts and the age box, and none still says 18+ is on by default', () => {
    // a whole word only: "Desligado por padrão" and "Desactivado por defecto" contain the phrase being banned
    const onByDefault = /(?<!\p{L})(ligado por padrão|on by default|activado por defecto|activé par défaut|standardmäßig an(?!\p{L})|attiv[oi] di default|standaard aan)|初期設定でオン|기본값이 켜짐|默认打开|по умолчанию включ|مفعّل افتراضيًا/iu
    for (const l of LOCALES) {
      const t = legalDict(l)
      for (const v of Object.values(t.configuracoes)) expect(v.length, l).toBeGreaterThan(1)
      for (const v of [t.adulto.preferenciaTexto, t.adulto.soMaior, t.adulto.escondidoConta, t.aceite.p3]) expect(v, l).not.toMatch(onByDefault)
      expect(t.adulto.confirmar, l).toMatch(/18/)
      expect(t.configuracoes.erroMaior, l).toMatch(/18/)
      expect(t.aceite.p3, l).toMatch(/18/)
    }
  })
})
