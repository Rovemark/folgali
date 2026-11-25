// A página de entrada da folgali (/entrar): um botão só, "Entrar com a Rovemark", ligado quando o login está configurado;
// com a pessoa já dentro, o nome dela e o "Sair". As páginas antigas de cadastro (/entrar/pessoa e /entrar/agente), que
// pediam e-mail para uma lista de espera, agora só redirecionam: a folgali nunca recebe o e-mail da pessoa.
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  redirecionar: vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`) }),
  pessoa: null as null | { id: string; nome: string },
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: h.notFound, permanentRedirect: h.redirecionar, usePathname: () => '/pt/entrar', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/folgali/sessao', () => ({ pessoaAtual: async () => h.pessoa }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))

import Entrar, { generateMetadata as metaEntrar } from '@/app/[lang]/entrar/page'
import EntrarComoAgente from '@/app/[lang]/entrar/agente/page'
import EntrarComoPessoa from '@/app/[lang]/entrar/pessoa/page'
import { ENTRAR_EN } from '@/i18n/entrar'
import { dict } from '@/lib/i18n'

const SEGREDO = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const params = (lang: string, erro?: string) => ({ params: Promise.resolve({ lang }), searchParams: Promise.resolve(erro ? { erro } : {}) })
const fe = (l: 'pt' | 'en') => dict(l).socFolgali.entrar
const tela = async (jsx: Promise<React.ReactElement>) => render(await jsx)

afterEach(() => {
  vi.unstubAllEnvs()
  h.pessoa = null
  document.body.innerHTML = ''
})

describe('/entrar', () => {
  it('sem o login configurado: o botão fica desligado, com "em breve" e a explicação; nada de Google ou Apple, nenhum link para a Rovemark', async () => {
    vi.stubEnv('FOLGALI_SESSAO_SEGREDO', '')
    await tela(Entrar(params('pt')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(fe('pt').titulo)
    const b = screen.getByRole('button', { name: new RegExp(fe('pt').botao) })
    expect(b).toBeDisabled()
    expect(b).toHaveTextContent(fe('pt').emBreve)
    expect(screen.getByText(fe('pt').emBreveTexto)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Google|Apple/)
    expect(document.querySelector('a[href*="/api/auth"]')).toBeNull()
  })
  it('com o login configurado: "Entrar com a Rovemark" e "Criar conta" começam pelo próprio site, com o idioma (criar abre já na tela de criar)', async () => {
    vi.stubEnv('FOLGALI_SESSAO_SEGREDO', SEGREDO)
    await tela(Entrar(params('en')))
    expect(screen.getByRole('link', { name: new RegExp(fe('en').botao) })).toHaveAttribute('href', '/api/auth/rovemark/inicio?lang=en')
    expect(screen.getByRole('link', { name: fe('en').criar })).toHaveAttribute('href', '/api/auth/rovemark/inicio?lang=en&tela=criar')
  })
  it('com a pessoa dentro: o nome dela, o caminho do feed e o "Sair" (formulário POST, link não derruba ninguém)', async () => {
    vi.stubEnv('FOLGALI_SESSAO_SEGREDO', SEGREDO)
    h.pessoa = { id: 'p_lumi123456', nome: 'Ana Folga' }
    await tela(Entrar(params('pt')))
    expect(screen.getByText('Você entrou como Ana Folga.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: new RegExp(fe('pt').botao) })).toBeNull()
    const sair = screen.getByRole('button', { name: fe('pt').sair })
    expect(sair.closest('form')).toHaveAttribute('action', '/api/auth/sair?lang=pt')
    expect(sair.closest('form')).toHaveAttribute('method', 'post')
  })
  it('a volta com erro mostra o aviso certo; erro desconhecido não mostra nada', async () => {
    for (const e of ['pedido', 'cancelado', 'troca'] as const) {
      await tela(Entrar(params('pt', e)))
      expect(screen.getByRole('alert')).toHaveTextContent(fe('pt').erros[e])
      document.body.innerHTML = ''
    }
    await tela(Entrar(params('pt', '<script>')))
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('a página tem o próprio topo ("Já tem conta?") e o caminho para agentes de fora', async () => {
    await tela(Entrar(params('pt')))
    expect(screen.getByText(fe('pt').jaTem)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: fe('pt').agenteLink })).toHaveAttribute('href', '/pt/agentes')
  })
  it('metadados no idioma; idioma que o site não tem vira 404', async () => {
    expect(await metaEntrar(params('en'))).toMatchObject({ title: ENTRAR_EN.meta.entrar.titulo })
    await expect(Entrar(params('xx'))).rejects.toThrow('NOT_FOUND')
  })
})

describe('as páginas antigas de cadastro', () => {
  it('/entrar/pessoa leva a /entrar e /entrar/agente leva a /agentes, no idioma; sem formulário de e-mail em lugar nenhum', async () => {
    await expect(EntrarComoPessoa(params('en'))).rejects.toThrow('REDIRECT /en/entrar')
    await expect(EntrarComoAgente(params('pt'))).rejects.toThrow('REDIRECT /pt/agentes')
    await expect(EntrarComoPessoa(params('xx'))).rejects.toThrow('NOT_FOUND')
  })
})
