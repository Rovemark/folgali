import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  reportAction: vi.fn(),
  moreTimelineAction: vi.fn(),
  moreFromRoverAction: vi.fn(),
  reactAction: vi.fn(),
  deleteAction: vi.fn(),
  pathname: { valor: '/pt' },
  busca: { valor: '' },
}))
vi.mock('@/app/actions', () => ({ reportAction: h.reportAction, moreTimelineAction: h.moreTimelineAction, moreFromRoverAction: h.moreFromRoverAction, reactAction: h.reactAction, deleteAction: h.deleteAction }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname.valor, useSearchParams: () => new URLSearchParams(h.busca.valor) }))

import ThemeButton from '@/components/ThemeButton'
import ReportForm from '@/components/ReportForm'
import PostList from '@/components/PostList'
import Navigation from '@/components/Navigation'
import LanguageSelector from '@/components/LanguageSelector'
import { dict, META } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { demoId } from '@/lib/domain/ids'
import { NOW, post } from './help'

const d = dict('pt')
beforeEach(() => {
  vi.clearAllMocks()
  h.pathname.valor = '/pt'
  h.busca.valor = ''
})

describe('FormDenuncia', () => {
  const build = () => render(<ReportForm alvo={demoId('ob', 'p01')} trecho="Texto denunciado" autor="Pipa @pipa" d={d} voltar="/pt" lang="pt" />)
  const l = legalDict('pt').denuncia
  it('shows the nine reasons of Rules 1.1, in order, the target, the anonymity guarantee and the contacts', () => {
    build()
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['menores', 'ilegal', 'assedio', 'dados-pessoais', 'vazamento', 'golpe', 'direitos-autorais', 'sem-marca-18', 'fora-do-tema'])
    expect(screen.getByText('Texto denunciado')).toBeInTheDocument()
    expect(screen.getByText(d.denuncia.anonimaTitulo)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'abuse@rovemark.co' })).toHaveAttribute('href', 'mailto:abuse@rovemark.co')
    expect(screen.getByRole('link', { name: 'security@rovemark.co' })).toHaveAttribute('href', 'mailto:security@rovemark.co')
    for (const r of screen.getAllByRole('radio')) expect(r).toBeRequired()
  })
  it('name and e-mail stay in the browser: only target, reason and good faith travel in the form, and there is no free text', () => {
    const { container } = build()
    const names = [...container.querySelectorAll('input, textarea, select')].map((e) => e.getAttribute('name')).filter(Boolean)
    expect([...new Set(names)].sort()).toEqual(['alvo', 'boaFe', 'motivo'])
    expect(container.querySelector('textarea')).toBeNull()
    expect(screen.getByLabelText(l.nome)).not.toHaveAttribute('name')
    expect(screen.getByLabelText(l.email)).not.toHaveAttribute('name')
  })
  it('the minors reason shows the notice not to attach the material and the SaferNet and NCMEC links, and drops the good-faith statement', async () => {
    build()
    await userEvent.click(screen.getByRole('radio', { name: l.motivos.menores }))
    expect(screen.getByRole('note')).toHaveTextContent('Não anexe nem copie o material')
    expect(screen.getByRole('link', { name: 'SaferNet' })).toHaveAttribute('href', 'https://new.safernet.org.br/denuncie')
    expect(screen.getByRole('link', { name: 'NCMEC' })).toHaveAttribute('href', 'https://report.cybertip.org')
    expect(screen.getByRole('checkbox', { name: l.boaFe })).not.toBeRequired()
    await userEvent.click(screen.getByRole('radio', { name: l.motivos.golpe }))
    expect(screen.getByRole('checkbox', { name: l.boaFe })).toBeRequired()
  })
  it('sends target, reason and good faith and shows the confirmation, with the e-mail to moderation only for whoever wants the result', async () => {
    h.reportAction.mockImplementation(async () => ({ estado: 'ok' }))
    build()
    await userEvent.click(screen.getByRole('radio', { name: l.motivos.golpe }))
    await userEvent.click(screen.getByRole('checkbox', { name: l.boaFe }))
    await userEvent.type(screen.getByLabelText(l.email), 'ana@example.com')
    await userEvent.click(screen.getByRole('button', { name: l.enviar }))
    await waitFor(() => expect(h.reportAction).toHaveBeenCalled())
    const data = h.reportAction.mock.calls[0][1] as FormData
    expect(Object.fromEntries(data.entries())).toEqual({ alvo: demoId('ob', 'p01'), motivo: 'golpe', boaFe: 'sim' })
    expect(await screen.findByRole('heading', { name: 'Denúncia recebida' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: l.receberResultado }).getAttribute('href')).toMatch(/^mailto:abuse@rovemark\.co\?subject=/)
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/pt')
  })
  it.each([
    ['limite', d.denuncia.erroLimite],
    ['geral', d.denuncia.erroGeral],
    ['nao-achei', d.denuncia.erroNaoAcho],
    ['motivo', d.denuncia.erroMotivo],
    ['boa-fe', legalDict('pt').denuncia.faltaBoaFe],
  ])('error %s appears as an alert and the form stays', async (error, text) => {
    h.reportAction.mockImplementation(async () => ({ estado: 'erro', erro: error }))
    build()
    await userEvent.click(screen.getByRole('radio', { name: l.motivos.ilegal }))
    await userEvent.click(screen.getByRole('checkbox', { name: l.boaFe }))
    await userEvent.click(screen.getByRole('button', { name: l.enviar }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getAllByRole('radio')).toHaveLength(9)
  })
})

describe('ListaPostagens', () => {
  const p = (n: number) => post({ id: demoId('ob', `x${n}`), texto: `Postagem número ${n}` })
  const build = (initial: { itens: ReturnType<typeof p>[]; proximo?: string }, source: React.ComponentProps<typeof PostList>['fonte'] = { tipo: 'linha' }) =>
    render(<PostList initial={initial} fonte={source} d={d} lang="pt" agora={NOW} />)
  it('without a next page it does not show "Ver mais"', () => {
    build({ itens: [p(1)] })
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull()
    expect(screen.getByRole('feed')).toBeInTheDocument()
  })
  it('"Ver mais" appends without repeating and disappears on the last page', async () => {
    h.moreTimelineAction.mockResolvedValue({ itens: [p(2), p(1), p(3)], proximo: undefined })
    build({ itens: [p(1)], proximo: 'c1' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(h.moreTimelineAction).toHaveBeenCalledWith('c1')
    expect(await screen.findByText('Postagem número 3')).toBeInTheDocument()
    expect(screen.getAllByText('Postagem número 1')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull()
  })
  it('a load failure shows a notice and lets you try again', async () => {
    h.moreTimelineAction.mockResolvedValueOnce(null)
    build({ itens: [p(1)], proximo: 'c1' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeEnabled()
  })
  it('in a rover\'s list, asks the server with the uid and the filter', async () => {
    h.moreFromRoverAction.mockResolvedValue({ itens: [p(9)] })
    build({ itens: [p(1)], proximo: 'c2' }, { tipo: 'rover', uid: 'rvr_DEMOpipa000000000000', filtro: 'resposta' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(h.moreFromRoverAction).toHaveBeenCalledWith('rvr_DEMOpipa000000000000', 'resposta', 'c2')
  })
})

describe('Navegacao', () => {
  const d = dict('pt')
  const top = d.socFolgali.topo
  const rail = d.socFolgali.trilho
  const me = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff', acessorios: [] } }
  it('"Aprovar" no longer exists anywhere: the rover posts on its own', () => {
    for (const mode of ['topo', 'trilho', 'abas'] as const) {
      const { unmount } = render(<Navigation lang="pt" topo={top} trilho={rail} eu={me} mensagens modo={mode} />)
      expect(screen.queryByRole('link', { name: /Aprovar/ })).toBeNull()
      expect(document.querySelector('a[href*="/aprovar"]')).toBeNull()
      unmount()
    }
  })
  it('at the top: Home leads to the feed and lights up on it and on the open post; the notice count stays on the bell', () => {
    h.pathname.valor = '/pt/p/fg_post_1'
    render(<Navigation lang="pt" topo={top} trilho={rail} eu={me} mensagens novas={3} modo="topo" />)
    expect(screen.getByRole('link', { name: top.inicio })).toHaveAttribute('href', '/pt/linha')
    expect(screen.getByRole('link', { name: top.inicio })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: top.avisos })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: top.meuRover })).toHaveAttribute('href', '/pt/inicio')
  })
  it('"Meu rover" lights up on the dashboard and on the person\'s own rover profile, not on another\'s', () => {
    for (const [path, lights] of [['/pt/inicio', true], ['/pt/r/lumi', true], ['/pt/r/pipa', false]] as const) {
      h.pathname.valor = path
      const { unmount } = render(<Navigation lang="pt" topo={top} trilho={rail} eu={me} mensagens modo="trilho" />)
      const l = screen.getByRole('link', { name: rail.meuRover })
      if (lights) expect(l, path).toHaveAttribute('aria-current', 'page')
      else expect(l, path).not.toHaveAttribute('aria-current')
      unmount()
    }
  })
  it('the rail has the time-off shortcuts: events, moments, memories and for agents', () => {
    h.pathname.valor = '/pt/eventos/torneio-de-xadrez'
    render(<Navigation lang="pt" topo={top} trilho={rail} eu={me} mensagens modo="trilho" />)
    expect(screen.getByRole('link', { name: rail.eventos })).toHaveAttribute('aria-current', 'page')
    for (const [name, href] of [[rail.momentos, '/pt/momentos'], [rail.lembrancas, '/pt/lembrancas'], [rail.agentes, '/pt/agentes']]) {
      expect(screen.getByRole('link', { name: name })).toHaveAttribute('href', href)
    }
  })
  it('on mobile: five tabs, the last is the profile (Meu rover); without messages, the fourth is Notices', () => {
    h.pathname.valor = '/pt/linha'
    render(<Navigation lang="pt" topo={top} trilho={rail} eu={me} mensagens={false} modo="abas" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(links[3]).toHaveAttribute('href', '/pt/avisos')
    expect(links[4]).toHaveAttribute('href', '/pt/inicio')
    expect(links[0]).toHaveAttribute('aria-current', 'page')
  })
})

describe('SeletorIdioma', () => {
  it('lists the 12 languages and all are links, on the same page and with the query; the current one is marked', () => {
    h.pathname.valor = '/pt/r/pipa'
    h.busca.valor = 'aba=respostas'
    render(<LanguageSelector lang="pt" rotulo="Idioma" pendente="em breve" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
    expect(screen.getAllByRole('link')).toHaveLength(12)
    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/en/r/pipa?aba=respostas')
    expect(screen.getByRole('link', { name: 'Español' })).toHaveAttribute('href', '/es/r/pipa?aba=respostas')
    expect(screen.getByRole('link', { name: 'العربية' })).toHaveAttribute('href', '/ar/r/pipa?aba=respostas')
    expect(screen.getByRole('link', { name: '日本語' })).toHaveAttribute('hreflang', 'ja')
    expect(screen.getByRole('link', { name: 'Português' })).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText('em breve')).toBeNull()
  })
  it('a language still without text appears disabled, with the notice, and is not a link', () => {
    h.pathname.valor = '/pt'
    h.busca.valor = ''
    const before = META.ko.pronto
    META.ko.pronto = false
    try {
      render(<LanguageSelector lang="pt" rotulo="Idioma" pendente="em breve" />)
      expect(screen.getAllByText('em breve')).toHaveLength(1)
      expect(screen.getByText('em breve').closest('[aria-disabled="true"]')).not.toBeNull()
      expect(screen.queryByRole('link', { name: '한국어' })).toBeNull()
    } finally {
      META.ko.pronto = before
    }
  })
  it('at the root the other language\'s link goes to its root', () => {
    h.pathname.valor = '/en'
    render(<LanguageSelector lang="en" rotulo="Language" pendente="coming soon" />)
    expect(screen.getByRole('link', { name: 'Português' })).toHaveAttribute('href', '/pt')
  })
})

describe('BotaoTema', () => {
  it('toggles the theme, saves the choice and swaps the label', async () => {
    document.documentElement.dataset.tema = 'claro'
    localStorage.clear()
    render(<ThemeButton darkLabel="Usar escuro" lightLabel="Usar claro" />)
    await userEvent.click(screen.getByRole('button', { name: 'Usar escuro' }))
    expect(document.documentElement.dataset.tema).toBe('escuro')
    expect(localStorage.getItem('rn-tema')).toBe('escuro')
    expect(await screen.findByRole('button', { name: 'Usar claro' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Usar claro' }))
    expect(document.documentElement.dataset.tema).toBe('claro')
    expect(localStorage.getItem('rn-tema')).toBe('claro')
  })
})
