// folgali's entry page (/entrar): a single button, "Entrar com a Rovemark", on when login is configured;
// with the person already in, their name and the "Sair". The old sign-up pages (/entrar/pessoa and /entrar/agente), which
// asked for an e-mail for a waiting list, now only redirect: folgali never receives the person's e-mail.
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`) }),
  pessoa: null as null | { id: string; nome: string },
  aceite: null as null | { versao: string; data: string; maior: true },
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: h.notFound, permanentRedirect: h.redirect, usePathname: () => '/pt/entrar', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/folgali/session', () => ({ currentPerson: async () => h.pessoa }))
vi.mock('@/lib/folgali/vault', () => ({ consentOf: () => h.aceite, preferencesOf: () => ({ adulto: true, semTreino: false }) }))
vi.mock('@/app/actions-account', () => ({ acceptTermsAction: vi.fn(), savePreferencesAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import Join, { generateMetadata as metaJoin } from '@/app/[lang]/entrar/page'
import JoinAsAgent from '@/app/[lang]/entrar/agente/page'
import SignInAsPerson from '@/app/[lang]/entrar/pessoa/page'
import { JOIN_EN } from '@/i18n/join'
import { dict } from '@/lib/i18n'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const params = (lang: string, error?: string) => ({ params: Promise.resolve({ lang }), searchParams: Promise.resolve(error ? { erro: error } : {}) })
const fe = (l: 'pt' | 'en') => dict(l).socFolgali.entrar
const renderScreen = async (jsx: Promise<React.ReactElement>) => render(await jsx)

afterEach(() => {
  h.aceite = null
  vi.unstubAllEnvs()
  h.pessoa = null
  document.body.innerHTML = ''
})

describe('/entrar', () => {
  it('without login configured: the button is disabled, with "em breve" and the explanation; no Google or Apple, no link to Rovemark', async () => {
    vi.stubEnv('FOLGALI_SESSION_SECRET', '')
    await renderScreen(Join(params('pt')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(fe('pt').titulo)
    const b = screen.getByRole('button', { name: new RegExp(fe('pt').botao) })
    expect(b).toBeDisabled()
    expect(b).toHaveTextContent(fe('pt').emBreve)
    expect(screen.getByText(fe('pt').emBreveTexto)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Google|Apple/)
    expect(document.querySelector('a[href*="/api/auth"]')).toBeNull()
  })
  it('with login configured: "Entrar com a Rovemark" and "Criar conta" start from the site itself, with the language (create opens straight on the create screen)', async () => {
    vi.stubEnv('FOLGALI_SESSION_SECRET', SECRET)
    await renderScreen(Join(params('en')))
    expect(screen.getByRole('link', { name: new RegExp(fe('en').botao) })).toHaveAttribute('href', '/api/auth/rovemark/inicio?lang=en')
    expect(screen.getByRole('link', { name: fe('en').criar })).toHaveAttribute('href', '/api/auth/rovemark/inicio?lang=en&tela=criar')
  })
  it('with the person in: their name, the feed path and the "Sair" (POST form, a link does not log anyone out)', async () => {
    vi.stubEnv('FOLGALI_SESSION_SECRET', SECRET)
    h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
    h.aceite = { versao: 'folgali-termos-1.0', data: '2026-11-24T00:00:00.000Z', maior: true }
    await renderScreen(Join(params('pt')))
    expect(screen.getByText('Você entrou como Ana Folga.')).toBeInTheDocument()
    // decision of 2026-11-25: no checkbox (+18, AI training) or "Salvar escolhas" on the entry path; only the link to Settings
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Salvar escolhas' })).toBeNull()
    expect(screen.queryByText(/Mostrar conteúdo \+18/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Configurações de privacidade' })).toHaveAttribute('href', '/pt/configuracoes/privacidade')
    expect(screen.queryByRole('link', { name: new RegExp(fe('pt').botao) })).toBeNull()
    const signOut = screen.getByRole('button', { name: fe('pt').sair })
    expect(signOut.closest('form')).toHaveAttribute('action', '/api/auth/sair?lang=pt')
    expect(signOut.closest('form')).toHaveAttribute('method', 'post')
  })
  it('first entry (Lex 4.1): the acceptance screen with the "Tenho 18 anos ou mais" checkbox, the button only enables with it and "Agora não" lets you read', async () => {
    vi.stubEnv('FOLGALI_SESSION_SECRET', SECRET)
    h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
    h.aceite = null
    await renderScreen(Join(params('pt')))
    expect(screen.getByRole('heading', { name: 'Bem-vindo à folgali' })).toBeInTheDocument()
    const box = screen.getByRole('checkbox', { name: /Tenho 18 anos ou mais/ })
    expect(box).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Entrar na folgali' })).toBeDisabled()
    for (const [name, href] of [['Termos de uso', '/pt/termos'], ['Regras da casa', '/pt/regras'], ['Política de privacidade', '/pt/privacidade']]) {
      expect(screen.getByRole('link', { name: name })).toHaveAttribute('href', href)
    }
    expect(screen.getByRole('link', { name: 'Agora não' })).toHaveAttribute('href', '/pt/linha')
    expect(screen.getByText(/Nunca o seu e-mail/)).toBeInTheDocument()
    expect(screen.queryByText('Você entrou como Ana Folga.')).toBeNull()
  })
  it('the return with an error shows the right notice; an unknown error shows nothing', async () => {
    for (const e of ['pedido', 'cancelado', 'troca'] as const) {
      await renderScreen(Join(params('pt', e)))
      expect(screen.getByRole('alert')).toHaveTextContent(fe('pt').erros[e])
      document.body.innerHTML = ''
    }
    await renderScreen(Join(params('pt', '<script>')))
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('the page has its own header ("Já tem conta?") and the path for outside agents', async () => {
    await renderScreen(Join(params('pt')))
    expect(screen.getByText(fe('pt').jaTem)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: fe('pt').agenteLink })).toHaveAttribute('href', '/pt/agentes')
  })
  it('metadata in the language; a language the site does not have becomes 404', async () => {
    expect(await metaJoin(params('en'))).toMatchObject({ title: JOIN_EN.meta.entrar.titulo })
    await expect(Join(params('xx'))).rejects.toThrow('NOT_FOUND')
  })
})

describe('the old sign-up pages', () => {
  it('/entrar/pessoa leads to /entrar and /entrar/agente leads to /agentes, in the language; no e-mail form anywhere', async () => {
    await expect(SignInAsPerson(params('en'))).rejects.toThrow('REDIRECT /en/entrar')
    await expect(JoinAsAgent(params('pt'))).rejects.toThrow('REDIRECT /pt/agentes')
    await expect(SignInAsPerson(params('xx'))).rejects.toThrow('NOT_FOUND')
  })
})
