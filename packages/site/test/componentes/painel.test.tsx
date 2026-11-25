// O painel "Meu rover" (/[lang]/inicio): cada bloco sozinho (vazio, com dados, com erro) e a PÁGINA montada de verdade em cima do
// cliente de demonstração, com e sem autorização permanente, sem app pareado e em árabe. Inclui a estrutura de acessibilidade que dá
// para provar sem navegador: marcos, ordem dos títulos, nome único dos links, nenhum botão que mude a autorização.
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt/inicio' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao: vi.fn(), maisAcao: vi.fn(), proporAcao: vi.fn(), marcarAvisosVistosAcao: vi.fn(async () => undefined) }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { ClienteFalso } from '@/lib/cliente-falso'
import type { Rede } from '@/lib/cliente-rede'

const h = vi.hoisted(() => ({ rede: null as unknown as Rede }))
vi.mock('@/lib/obter-rede', () => ({ obterRede: () => h.rede }))

import Inicio, { generateMetadata } from '@/app/[lang]/inicio/page'
import BlocoAtalhos from '@/components/painel/BlocoAtalhos'
import BlocoAutorizacao from '@/components/painel/BlocoAutorizacao'
import BlocoAvisos from '@/components/painel/BlocoAvisos'
import BlocoFeito from '@/components/painel/BlocoFeito'
import BlocoLimites from '@/components/painel/BlocoLimites'
import CabecalhoDoRover from '@/components/painel/CabecalhoDoRover'
import { dict } from '@/lib/i18n'
import type { AcaoPublicada } from '@/lib/painel/tipos'

const AGORA = new Date('2026-11-10T12:00:00.000Z')
const agora = AGORA.toISOString()
const d = dict('pt')
const t = d.socInicio
const ok = <T,>(valor: T) => ({ ok: true as const, valor })
const falhou = { ok: false as const, codigo: 'indisponivel' as const }
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString()

let cliente: ClienteFalso
beforeEach(() => {
  cliente = new ClienteFalso(() => AGORA)
  h.rede = { cliente, ponte: cliente }
})
const abrir = async (lang = 'pt') => render(await Inicio({ params: Promise.resolve({ lang }) }))
const secao = (nome: string) => screen.getByRole('region', { name: nome })

describe('a página, no cliente de demonstração', () => {
  const f = d.socFolgali.meuRover
  it('título, o rover de folga agora, o dia dele, amigos novos, humor e os controles', async () => {
    await abrir()
    expect(screen.getByRole('heading', { level: 1, name: f.titulo })).toBeInTheDocument()
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)
    expect(h2).toEqual(['Lumi está de folga agora', 'Hoje na vida da Lumi', f.amigosNovos, f.humor, t.avisos.titulo, f.controles])
  })
  it('não há fila de aprovação nem link para aprovar: o rover posta sozinho', async () => {
    const { container } = await abrir()
    expect(container.querySelector('a[href*="aprovar"]')).toBeNull()
    expect(screen.queryByText(/esperando/)).toBeNull()
  })
  it('controles: postar sozinho vem LIGADO, pausar vem desligado, limite padrão de 20 por dia', async () => {
    await abrir()
    const ctl = secao(f.controles)
    expect(within(ctl).getByRole('switch', { name: 'Lumi pode postar sozinha' })).toHaveAttribute('aria-checked', 'true')
    expect(within(ctl).getByRole('switch', { name: f.pausar })).toHaveAttribute('aria-checked', 'false')
    expect(within(ctl).getByLabelText('20 por dia')).toHaveTextContent('20')
    expect(within(ctl).getByText(f.memoria)).toBeInTheDocument()
  })
  it('pausar a folga avisa na hora; o limite sobe e desce sem sair de 1 a 40', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    await abrir()
    const ctl = secao(f.controles)
    await user.click(within(ctl).getByRole('switch', { name: f.pausar }))
    expect(within(ctl).getByText('A folga da Lumi está pausada')).toBeInTheDocument()
    await user.click(within(ctl).getByRole('button', { name: f.mais }))
    expect(within(ctl).getByLabelText('21 por dia')).toBeInTheDocument()
  })
  it('o humor da semana tem descrição em texto para quem não vê o gráfico', async () => {
    await abrir()
    expect(screen.getByRole('img', { name: /Gráfico do humor da Lumi de segunda a domingo/ })).toBeInTheDocument()
  })
  it('avisos: os não lidos com link para todos; abrir o painel não marca nada como visto', async () => {
    const marcar = vi.spyOn(cliente, 'marcarAvisosVistos')
    await abrir()
    const b = secao(t.avisos.titulo)
    expect(within(b).getAllByRole('listitem').length).toBeLessThanOrEqual(3)
    expect(within(b).getByRole('link', { name: t.avisos.verTodos })).toHaveAttribute('href', '/pt/avisos')
    expect(marcar).not.toHaveBeenCalled()
  })
  it('em árabe a página monta (o espelho é do CSS lógico)', async () => {
    await abrir('ar')
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(3)
  })
  it('sem app pareado: não há rover para mostrar, e a página diz isso', async () => {
    h.rede = { cliente, ponte: { ...cliente, quemSou: async () => null } as unknown as Rede['ponte'] }
    await abrir()
    expect(screen.getByRole('heading', { name: f.semAppTitulo })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: f.controles })).toBeNull()
  })
  it('idioma desconhecido é 404', async () => {
    await expect(Inicio({ params: Promise.resolve({ lang: 'xx' }) })).rejects.toThrow('NOT_FOUND')
  })
  it('metadados: título do registro, canonical no idioma e noindex (com a flag desligada e ligada)', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ lang: 'en' }) })
    expect(m.title).toBe('My rover')
    expect(m.alternates?.canonical).toBe('https://folgali.com/en/inicio')
    expect(m.robots).toMatchObject({ index: false })
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', 'sim')
    try {
      expect((await generateMetadata({ params: Promise.resolve({ lang: 'pt' }) })).robots).toMatchObject({ index: false, follow: false })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('cada bloco sozinho', () => {
  const eu = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'marshmallow', cor: '#f2e8d6', acessorios: ['laco'] } }
  const acao = (x: Partial<AcaoPublicada>): AcaoPublicada => ({ id: 'ob_1', tipo: 'postagem', em: antes(5), trecho: 'Oi.', para: null, caminho: '/p/ob_1', via: 'aprovacao', ...x })

  it('falha ao ler um bloco aparece como falha, nunca como "nada"', () => {
    render(
      <>
        <BlocoFeito publicados={falhou} d={d} lang="pt" agora={agora} />
        <BlocoAvisos avisos={falhou} meuHandle="lumi" d={d} lang="pt" agora={agora} />
        <BlocoAutorizacao autorizacao={falhou} publicados={[]} d={d} lang="pt" agora={agora} />
        <BlocoLimites publicados={falhou} contaDesde={null} d={d} agora={agora} />
      </>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(4)
    expect(screen.queryByText(t.feito.vazioTitulo)).toBeNull()
    expect(screen.queryByText(t.autorizacao.nenhumaTitulo)).toBeNull()
  })
  it('o que fez: vazio honesto; com para quem, a data relativa e o link com nome que diz o quê', () => {
    const { unmount } = render(<BlocoFeito publicados={ok([])} d={d} lang="pt" agora={agora} />)
    expect(screen.getByText(t.feito.vazioTitulo)).toBeInTheDocument()
    unmount()
    render(<BlocoFeito publicados={ok([acao({ tipo: 'recado', para: { ...eu, nome: 'Pipa', handle: 'pipa' }, caminho: '/r/pipa?aba=mural', em: antes(120) })])} d={d} lang="pt" agora={agora} />)
    expect(screen.getByText('Pipa').tagName).toBe('BDI')
    expect(screen.getByText('há 2 h')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Abrir\s*: Recado para Pipa, há 2 h$/ })).toHaveAttribute('href', '/pt/r/pipa?aba=mural')
  })
  it('o que fez: objeto sem página não ganha link', () => {
    render(<BlocoFeito publicados={ok([acao({ caminho: null })])} d={d} lang="pt" agora={agora} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('avisos: sem nada novo, diz isso; a contagem continua no topo', () => {
    render(<BlocoAvisos avisos={ok({ lista: [], total: 0 })} meuHandle="lumi" d={d} lang="pt" agora={agora} />)
    expect(screen.getByText('Nenhum aviso novo')).toBeInTheDocument()
    expect(screen.getByText(t.avisos.vazioTexto)).toBeInTheDocument()
  })
  it('avisos: se a contagem diz que há novos mas a primeira página não os trouxe, não diz "nada de novo" (seria contradição)', () => {
    render(<BlocoAvisos avisos={ok({ lista: [], total: 3 })} meuHandle="lumi" d={d} lang="pt" agora={agora} />)
    expect(screen.getByText('3 avisos novos')).toBeInTheDocument()
    expect(screen.queryByText(t.avisos.vazioTexto)).toBeNull()
    expect(screen.getByRole('link', { name: t.avisos.verTodos })).toBeInTheDocument()
  })
  it('autorização vencida: avisa que venceu e que o relé recusa', () => {
    const a = { id: 'au_x', tipos: ['postagem'], emitidaEm: antes(8 * 1440), expiraEm: antes(1440), maxPorHora: 2, maxPorDia: 4 }
    render(<BlocoAutorizacao autorizacao={ok(a)} publicados={[]} d={d} lang="pt" agora={agora} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^Venceu em .*O relé recusa/)
    expect(screen.getByText('0 de 2')).toBeInTheDocument()
  })
  it('limites: conta nova avisa o fator; tipo esgotado diz que chegou ao limite', () => {
    const muitos = Array.from({ length: 2 }, (_, i) => acao({ id: `ob_${i}`, em: antes(i + 1) }))
    render(<BlocoLimites publicados={ok(muitos)} contaDesde={antes(120)} d={d} agora={agora} />)
    expect(screen.getByText(/os limites valem 20% do normal até ela completar 1 dias/)).toBeInTheDocument()
    const postagens = screen.getByText('Postagens').closest('li')!
    expect(postagens).toHaveAttribute('data-esgotado', 'true')
    expect(within(postagens).getByText('chegou ao limite por enquanto')).toBeInTheDocument()
    expect(within(postagens).getByText('2 de 2 na última hora, 2 de 8 nas últimas 24 horas')).toBeInTheDocument()
  })
  it('cabeçalho: contagem fechada é cadeado com texto para leitor de tela, nunca zero', async () => {
    const pag = await cliente.paginaDoRover((await cliente.quemSou())!.uid)
    render(<CabecalhoDoRover pag={{ ...pag, contagens: { ...pag.contagens, amigos: null } }} d={d} lang="pt" />)
    expect(screen.getByText(t.cab.amigos).nextSibling?.textContent).toBe(t.cab.privado)
  })
  it('atalhos usam o handle e o idioma', () => {
    render(<BlocoAtalhos meuHandle="pipa" d={dict('en')} lang="en" />)
    expect(screen.getByRole('link', { name: /See the public profile/ })).toHaveAttribute('href', '/en/r/pipa')
  })
})
