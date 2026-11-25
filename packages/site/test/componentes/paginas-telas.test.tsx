// As telas (componentes de servidor) montadas de verdade em cima do cliente falso social: o que cada papel enxerga.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }) }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao: vi.fn(), maisAcao: vi.fn(), proporAcao: vi.fn() }))
vi.mock('@/app/acoes', () => ({ reagirAcao: vi.fn(), apagarAcao: vi.fn(), seguirAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { ClienteFalso } from '@/lib/cliente-falso'
import { PAGINAS, COMUNIDADES } from '@/lib/social/demo-ids'

const falso = new ClienteFalso(() => new Date('2026-11-05T15:00:00.000Z'))
vi.mock('@/lib/obter-rede', () => ({ obterRede: () => ({ cliente: falso, ponte: falso }) }))

import Buscar from '@/app/[lang]/buscar/page'
import Descobrir from '@/app/[lang]/descobrir/page'
import Linha from '@/app/[lang]/linha/page'
import Moderacao from '@/app/[lang]/moderacao/page'
import Paginas from '@/app/[lang]/paginas/page'
import NovaPagina from '@/app/[lang]/paginas/nova/page'
import PaginaDeProjeto from '@/app/[lang]/paginas/[id]/page'

const lang = Promise.resolve({ lang: 'pt' })
const tela = async (jsx: Promise<React.ReactElement>) => render(await jsx)

beforeEach(() => {
  notFound.mockClear()
})

describe('página de projeto: cada papel enxerga o seu', () => {
  const abrir = (id: string, aba?: string) => tela(PaginaDeProjeto({ params: Promise.resolve({ lang: 'pt', id }), searchParams: Promise.resolve({ aba }) }))
  it('visitante (não segue): vê Seguir, sem Gerir e sem escrever', async () => {
    await abrir(PAGINAS.marshmallow)
    expect(screen.getByRole('heading', { level: 1, name: 'Fãs do Marshmallow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seguir' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gerir/ })).toBeNull()
    expect(screen.queryByText('Escrever uma atualização')).toBeNull()
  })
  it('seguidor: vê Seguindo, sem Gerir', async () => {
    await abrir(PAGINAS.nuvens)
    expect(screen.getByRole('button', { name: 'Seguindo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('link', { name: /Gerir/ })).toBeNull()
  })
  it('dono: sem botão de seguir a própria página, com Gerir e com o formulário de atualização', async () => {
    await abrir(PAGINAS.disco)
    expect(screen.getByText('Sua página')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Segu/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Gerir/ })).toBeInTheDocument()
    expect(screen.getByText('Escrever uma atualização')).toBeInTheDocument()
  })
  it('administrador: escreve e gere, mas a tela diz que apagar é do dono', async () => {
    await abrir(PAGINAS.cafe)
    expect(screen.getByText('Você administra')).toBeInTheDocument()
    expect(screen.getByText('Escrever uma atualização')).toBeInTheDocument()
  })
  it('a aba Gerir de quem não tem papel vira "sem permissão", não a tela de gerir', async () => {
    await abrir(PAGINAS.marshmallow, 'gerir')
    expect(screen.getByText('Esta porta não é sua')).toBeInTheDocument()
    expect(screen.queryByText('Dados da página')).toBeNull()
  })
  it('seguidores: só os públicos e a nota que explica por quê', async () => {
    await abrir(PAGINAS.nuvens, 'seguidores')
    expect(screen.getByText(/mantêm o grafo público/)).toBeInTheDocument()
  })
  it('id que não existe e id mal formado dão "não encontrado"', async () => {
    await expect(abrir('ob_DEMOnaoexiste000000000000000000000000000')).rejects.toThrow('NOT_FOUND')
    await expect(abrir('lixo')).rejects.toThrow('NOT_FOUND')
  })
})

describe('lista de páginas', () => {
  it('Todas traz as 4 etiquetas; Minhas traz as da Lumi; Que sigo traz as que ele segue', async () => {
    const { unmount } = await tela(Paginas({ params: lang, searchParams: Promise.resolve({}) }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toHaveLength(4)
    unmount()
    const m = await tela(Paginas({ params: lang, searchParams: Promise.resolve({ aba: 'minhas' }) }))
    const minhas = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(minhas).toContain('Disco da Semana')
    expect(minhas).toContain('Clube do Café da Tuca')
    expect(minhas).not.toContain('Fãs do Marshmallow')
    m.unmount()
    await tela(Paginas({ params: lang, searchParams: Promise.resolve({ aba: 'sigo' }) }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Caçadores de Nuvens'])
  })
  it('tema inválido na URL é ignorado em vez de ir para o relé', async () => {
    await tela(Paginas({ params: lang, searchParams: Promise.resolve({ tema: '<script>' }) }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4)
  })
  it('criar uma página abre o formulário com nome, descrição e tema', async () => {
    await tela(NovaPagina({ params: lang }))
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText(/Tema/)).toBeInTheDocument()
  })
})

describe('busca', () => {
  const buscar = (q?: string, tipo?: string) => tela(Buscar({ params: lang, searchParams: Promise.resolve({ q, tipo }) }))
  it('sem termo mostra o começo (tags e dicas), sem resultado', async () => {
    await buscar()
    expect(screen.getByText('Como a busca lê o que você escreve')).toBeInTheDocument()
  })
  it('uma letra é curto demais, e o relé nem é chamado', async () => {
    const espiao = vi.spyOn(falso, 'buscarTudo')
    await buscar('a')
    expect(screen.getByText('Escreva um pouco mais')).toBeInTheDocument()
    expect(espiao).not.toHaveBeenCalled()
    espiao.mockRestore()
  })
  it('um termo que não casa mostra o estado de sem resultado com saídas', async () => {
    await buscar('zzzzzz')
    expect(screen.getByText('Nada com esse nome')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver o que está em alta' })).toBeInTheDocument()
  })
  it('"domingo" acha rover, comunidade, tópicos e página, com o termo marcado', async () => {
    const { container } = await buscar('domingo')
    expect(screen.getByRole('heading', { name: '1 comunidade' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 página' })).toBeInTheDocument()
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(3)
  })
  it('nunca mostra comunidade fechada, nem pelo nome exato', async () => {
    // "Vitrola" também é palavra comum nos textos, e a Lumi é dona dela: os tópicos dela podem aparecer (dizendo onde moram),
    // mas o cartão da comunidade fechada nunca
    const { container } = await buscar('Vitrola')
    expect(container.querySelector(`a[href="/pt/comunidades/${COMUNIDADES.vitrola}"]:not(.topico-mini-onde)`)).toBeNull()
    expect(screen.queryByRole('heading', { name: /comunidade/ })).toBeNull()
    await buscar('Jardim de Varanda')
    expect(screen.queryByText('Jardim de Varanda')).toBeNull()
  })
  it('#tag procura a tag e avisa', async () => {
    await buscar('#pipoca')
    expect(screen.getByRole('note')).toHaveTextContent('#pipoca')
  })
  it('por tipo mostra só aquele tipo', async () => {
    await buscar('pi', 'rovers')
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/pt/r/pipa')).toBe(true)
    expect(screen.queryByRole('heading', { name: /comunidade/ })).toBeNull()
  })
})

describe('descobrir, linha e registro', () => {
  it('descobrir mostra a nota honesta das sugestões e as tendências com 3 autores', async () => {
    await tela(Descobrir({ params: lang, searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/ninguém aqui sabe o que você leu/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /#pipoca/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registro público de moderação do relé' })).toHaveAttribute('href', '/pt/moderacao')
  })
  it('a janela de 7 dias é aceita e outra coisa cai em 24 horas', async () => {
    const { unmount } = await tela(Descobrir({ params: lang, searchParams: Promise.resolve({ janela: '7d' }) }))
    expect(screen.getByRole('link', { name: 'Últimos 7 dias' })).toHaveAttribute('aria-current', 'true')
    unmount()
    await tela(Descobrir({ params: lang, searchParams: Promise.resolve({ janela: 'qualquer' }) }))
    expect(screen.getByRole('link', { name: 'Últimas 24 horas' })).toHaveAttribute('aria-current', 'true')
  })
  it('o feed mistura as atualizações das páginas seguidas e não fala mais de rascunho esperando aprovação', async () => {
    await tela(Linha({ params: lang }))
    expect(screen.getAllByText('Página').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: /rascunhos/ })).toBeNull()
    expect(document.querySelector('a[href*="aprovar"]')).toBeNull()
    // as postagens da folga (com foto) e os momentos vêm antes da linha do relé
    expect(screen.getByRole('heading', { name: 'Momentos' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Comentar' }).length).toBeGreaterThan(0)
  })
  it('a linha não traz atualização de página que a Lumi não segue', async () => {
    await tela(Linha({ params: lang }))
    expect(screen.queryByText('Cor do mês: areia clara')).toBeNull()
  })
  it('o registro do relé explica que não traz texto nem nome de quem moderou', async () => {
    await tela(Moderacao({ params: lang }))
    expect(screen.getByText(/Não traz o texto removido nem o nome de quem moderou/)).toBeInTheDocument()
    expect(screen.getAllByText('Conteúdo removido').length).toBeGreaterThan(0)
  })
})

void COMUNIDADES
