import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  denunciarAcao: vi.fn(),
  maisLinhaAcao: vi.fn(),
  maisDoRoverAcao: vi.fn(),
  reagirAcao: vi.fn(),
  apagarAcao: vi.fn(),
  pathname: { valor: '/pt' },
  busca: { valor: '' },
}))
vi.mock('@/app/acoes', () => ({ denunciarAcao: h.denunciarAcao, maisLinhaAcao: h.maisLinhaAcao, maisDoRoverAcao: h.maisDoRoverAcao, reagirAcao: h.reagirAcao, apagarAcao: h.apagarAcao }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname.valor, useSearchParams: () => new URLSearchParams(h.busca.valor) }))

import BotaoTema from '@/components/BotaoTema'
import FormDenuncia from '@/components/FormDenuncia'
import ListaPostagens from '@/components/ListaPostagens'
import Navegacao from '@/components/Navegacao'
import SeletorIdioma from '@/components/SeletorIdioma'
import { dict, META } from '@/lib/i18n'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { AGORA, postagem } from './ajuda'

const d = dict('pt')
beforeEach(() => {
  vi.clearAllMocks()
  h.pathname.valor = '/pt'
  h.busca.valor = ''
})

describe('FormDenuncia', () => {
  const montar = () => render(<FormDenuncia alvo={idDeDemonstracao('ob', 'p01')} trecho="Texto denunciado" autor="Pipa @pipa" d={d} voltar="/pt" />)
  it('mostra os seis motivos, o alvo e a garantia de anonimato', () => {
    montar()
    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(screen.getByText('Texto denunciado')).toBeInTheDocument()
    expect(screen.getByText(d.denuncia.anonimaTitulo)).toBeInTheDocument()
    for (const r of screen.getAllByRole('radio')) expect(r).toBeRequired()
  })
  it('não tem campo que identifique quem denuncia nem texto livre', () => {
    const { container } = montar()
    const nomes = [...container.querySelectorAll('input, textarea, select')].map((e) => e.getAttribute('name'))
    expect([...new Set(nomes)].sort()).toEqual(['alvo', 'motivo'])
    expect(container.querySelector('textarea')).toBeNull()
  })
  it('envia alvo e motivo e mostra a confirmação', async () => {
    h.denunciarAcao.mockImplementation(async () => ({ estado: 'ok' }))
    montar()
    await userEvent.click(screen.getByRole('radio', { name: /Spam/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar denúncia' }))
    await waitFor(() => expect(h.denunciarAcao).toHaveBeenCalled())
    const dados = h.denunciarAcao.mock.calls[0][1] as FormData
    expect(Object.fromEntries(dados.entries())).toEqual({ alvo: idDeDemonstracao('ob', 'p01'), motivo: 'spam' })
    expect(await screen.findByRole('heading', { name: 'Denúncia recebida' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/pt')
  })
  it.each([
    ['limite', d.denuncia.erroLimite],
    ['geral', d.denuncia.erroGeral],
    ['nao-achei', d.denuncia.erroNaoAcho],
    ['motivo', d.denuncia.erroMotivo],
  ])('erro %s aparece como alerta e o formulário continua', async (erro, texto) => {
    h.denunciarAcao.mockImplementation(async () => ({ estado: 'erro', erro }))
    montar()
    await userEvent.click(screen.getByRole('radio', { name: /Golpe/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar denúncia' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(texto)
    expect(screen.getAllByRole('radio')).toHaveLength(6)
  })
})

describe('ListaPostagens', () => {
  const p = (n: number) => postagem({ id: idDeDemonstracao('ob', `x${n}`), texto: `Postagem número ${n}` })
  const montar = (inicial: { itens: ReturnType<typeof p>[]; proximo?: string }, fonte: React.ComponentProps<typeof ListaPostagens>['fonte'] = { tipo: 'linha' }) =>
    render(<ListaPostagens inicial={inicial} fonte={fonte} d={d} lang="pt" agora={AGORA} />)
  it('sem próxima página não mostra "Ver mais"', () => {
    montar({ itens: [p(1)] })
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull()
    expect(screen.getByRole('feed')).toBeInTheDocument()
  })
  it('"Ver mais" acrescenta sem repetir e some na última página', async () => {
    h.maisLinhaAcao.mockResolvedValue({ itens: [p(2), p(1), p(3)], proximo: undefined })
    montar({ itens: [p(1)], proximo: 'c1' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(h.maisLinhaAcao).toHaveBeenCalledWith('c1')
    expect(await screen.findByText('Postagem número 3')).toBeInTheDocument()
    expect(screen.getAllByText('Postagem número 1')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull()
  })
  it('falha ao carregar mostra aviso e deixa tentar de novo', async () => {
    h.maisLinhaAcao.mockResolvedValueOnce(null)
    montar({ itens: [p(1)], proximo: 'c1' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeEnabled()
  })
  it('na lista de um rover, pede ao servidor com o uid e o filtro', async () => {
    h.maisDoRoverAcao.mockResolvedValue({ itens: [p(9)] })
    montar({ itens: [p(1)], proximo: 'c2' }, { tipo: 'rover', uid: 'rvr_DEMOpipa000000000000', filtro: 'resposta' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(h.maisDoRoverAcao).toHaveBeenCalledWith('rvr_DEMOpipa000000000000', 'resposta', 'c2')
  })
})

describe('Navegacao', () => {
  const d = dict('pt')
  const topo = d.socFolgali.topo
  const trilho = d.socFolgali.trilho
  const eu = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff', acessorios: [] } }
  it('não existe mais "Aprovar" em lugar nenhum: o rover posta sozinho', () => {
    for (const modo of ['topo', 'trilho', 'abas'] as const) {
      const { unmount } = render(<Navegacao lang="pt" topo={topo} trilho={trilho} eu={eu} mensagens modo={modo} />)
      expect(screen.queryByRole('link', { name: /Aprovar/ })).toBeNull()
      expect(document.querySelector('a[href*="/aprovar"]')).toBeNull()
      unmount()
    }
  })
  it('no topo: Início leva ao feed e acende nele e na postagem aberta; o número de avisos fica no sino', () => {
    h.pathname.valor = '/pt/p/fg_post_1'
    render(<Navegacao lang="pt" topo={topo} trilho={trilho} eu={eu} mensagens novas={3} modo="topo" />)
    expect(screen.getByRole('link', { name: topo.inicio })).toHaveAttribute('href', '/pt/linha')
    expect(screen.getByRole('link', { name: topo.inicio })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: topo.avisos })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: topo.meuRover })).toHaveAttribute('href', '/pt/inicio')
  })
  it('"Meu rover" acende no painel e no perfil do próprio rover, não no de outro', () => {
    for (const [caminho, acende] of [['/pt/inicio', true], ['/pt/r/lumi', true], ['/pt/r/pipa', false]] as const) {
      h.pathname.valor = caminho
      const { unmount } = render(<Navegacao lang="pt" topo={topo} trilho={trilho} eu={eu} mensagens modo="trilho" />)
      const l = screen.getByRole('link', { name: trilho.meuRover })
      if (acende) expect(l, caminho).toHaveAttribute('aria-current', 'page')
      else expect(l, caminho).not.toHaveAttribute('aria-current')
      unmount()
    }
  })
  it('o trilho tem os atalhos da folga: eventos, momentos, lembranças e para agentes', () => {
    h.pathname.valor = '/pt/eventos/noite-de-jogos'
    render(<Navegacao lang="pt" topo={topo} trilho={trilho} eu={eu} mensagens modo="trilho" />)
    expect(screen.getByRole('link', { name: trilho.eventos })).toHaveAttribute('aria-current', 'page')
    for (const [nome, href] of [[trilho.momentos, '/pt/momentos'], [trilho.lembrancas, '/pt/lembrancas'], [trilho.agentes, '/pt/agentes']]) {
      expect(screen.getByRole('link', { name: nome })).toHaveAttribute('href', href)
    }
  })
  it('no celular: cinco abas, a última é o perfil (Meu rover); sem mensagens, a quarta é Avisos', () => {
    h.pathname.valor = '/pt/linha'
    render(<Navegacao lang="pt" topo={topo} trilho={trilho} eu={eu} mensagens={false} modo="abas" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(links[3]).toHaveAttribute('href', '/pt/avisos')
    expect(links[4]).toHaveAttribute('href', '/pt/inicio')
    expect(links[0]).toHaveAttribute('aria-current', 'page')
  })
})

describe('SeletorIdioma', () => {
  it('lista os 12 idiomas e todos são links, na mesma página e com a consulta; o atual é marcado', () => {
    h.pathname.valor = '/pt/r/pipa'
    h.busca.valor = 'aba=respostas'
    render(<SeletorIdioma lang="pt" rotulo="Idioma" pendente="em breve" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
    expect(screen.getAllByRole('link')).toHaveLength(12)
    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/en/r/pipa?aba=respostas')
    expect(screen.getByRole('link', { name: 'Español' })).toHaveAttribute('href', '/es/r/pipa?aba=respostas')
    expect(screen.getByRole('link', { name: 'العربية' })).toHaveAttribute('href', '/ar/r/pipa?aba=respostas')
    expect(screen.getByRole('link', { name: '日本語' })).toHaveAttribute('hreflang', 'ja')
    expect(screen.getByRole('link', { name: 'Português' })).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText('em breve')).toBeNull()
  })
  it('um idioma ainda sem texto aparece desligado, com o aviso, e não é link', () => {
    h.pathname.valor = '/pt'
    h.busca.valor = ''
    const antes = META.ko.pronto
    META.ko.pronto = false
    try {
      render(<SeletorIdioma lang="pt" rotulo="Idioma" pendente="em breve" />)
      expect(screen.getAllByText('em breve')).toHaveLength(1)
      expect(screen.getByText('em breve').closest('[aria-disabled="true"]')).not.toBeNull()
      expect(screen.queryByRole('link', { name: '한국어' })).toBeNull()
    } finally {
      META.ko.pronto = antes
    }
  })
  it('na raiz o link do outro idioma vai para a raiz dele', () => {
    h.pathname.valor = '/en'
    render(<SeletorIdioma lang="en" rotulo="Language" pendente="coming soon" />)
    expect(screen.getByRole('link', { name: 'Português' })).toHaveAttribute('href', '/pt')
  })
})

describe('BotaoTema', () => {
  it('alterna o tema, grava a escolha e troca o rótulo', async () => {
    document.documentElement.dataset.tema = 'claro'
    localStorage.clear()
    render(<BotaoTema rotuloEscuro="Usar escuro" rotuloClaro="Usar claro" />)
    await userEvent.click(screen.getByRole('button', { name: 'Usar escuro' }))
    expect(document.documentElement.dataset.tema).toBe('escuro')
    expect(localStorage.getItem('rn-tema')).toBe('escuro')
    expect(await screen.findByRole('button', { name: 'Usar claro' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Usar claro' }))
    expect(document.documentElement.dataset.tema).toBe('claro')
    expect(localStorage.getItem('rn-tema')).toBe('claro')
  })
})
