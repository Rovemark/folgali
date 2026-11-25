// As PÁGINAS da revisão 0.3.2 montadas de verdade em cima do cliente de demonstração, e do mesmo cliente "como relé 0.3.1" (sem os 4 recursos novos):
// a tela nova aparece com o relé novo e some, sem quebrar, com o relé antigo.
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao: vi.fn(), maisAcao: vi.fn(), proporAcao: vi.fn(), marcarAvisosVistosAcao: vi.fn(async () => undefined) }))
vi.mock('@/app/acoes', () => ({ reagirAcao: vi.fn(), apagarAcao: vi.fn(), seguirAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { ClienteFalso } from '@/lib/cliente-falso'
import { COMUNIDADES, TOPICOS } from '@/lib/social/demo-ids'

let atual: ClienteFalso
vi.mock('@/lib/obter-rede', () => ({ obterRede: () => ({ cliente: atual, ponte: atual }) }))

import Linha from '@/app/[lang]/linha/page'
import Buscar from '@/app/[lang]/buscar/page'
import ComunidadePagina from '@/app/[lang]/comunidades/[id]/page'
import TopicoPagina from '@/app/[lang]/t/[id]/page'
import Marcas, { ChipDeEtiqueta } from '@/components/comunidades/Marcas'
import AnunciosDoRele from '@/components/AnunciosDoRele'
import { dict } from '@/lib/i18n'

const RELOGIO = new Date('2026-11-05T15:00:00.000Z')
/** O mesmo cliente, fingindo ser um relé 0.3.1: nenhum recurso da 0.3.2 e nada do que ela acrescenta nas respostas. */
function comoRele031(c: ClienteFalso) {
  const x = Object.create(c) as ClienteFalso
  x.suporta = async (r) => !['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios'].includes(r) && c.suporta(r)
  x.anuncios = async () => ({ itens: [] })
  const comunidade = c.comunidade.bind(c)
  x.comunidade = async (id: string) => {
    const k = (await comunidade(id)) as unknown as Record<string, unknown>
    delete k.vocabulario
    return k as never
  }
  const topicos = c.topicos.bind(c)
  x.topicos = async (id, o) => {
    const l = await topicos(id, o)
    const sem = <T extends object>(t: T) => { const n = { ...t } as Record<string, unknown>; delete n.marcas; return n as T }
    return { ...l, itens: l.itens.map(sem), fixados: l.fixados?.map(sem) }
  }
  return x
}
const lang = { lang: 'pt' }
const tela = async (jsx: Promise<React.ReactElement>) => render(await jsx)
const links = (nome: string) => within(screen.getByRole('navigation', { name: nome })).getAllByRole('link').map((a) => a.textContent)

beforeEach(() => {
  atual = new ClienteFalso(() => RELOGIO)
})

describe('lista de conversas da comunidade', () => {
  const abrir = (sp: Record<string, string> = {}, id = COMUNIDADES.cinema) => tela(ComunidadePagina({ params: Promise.resolve({ ...lang, id }), searchParams: Promise.resolve(sp) }))
  it('com o relé 0.3.2 há Melhores e Em alta; a nota diz que a conta é de pessoas; o em-alta leva o período', async () => {
    await abrir({ ordem: 'em-alta', janela: '7d' })
    expect(links('Ordem das conversas')).toEqual(['Recentes', 'Ativas', 'Sem resposta', 'Melhores', 'Em alta'])
    expect(screen.getByText(/contam pessoas diferentes, nunca vezes/)).toBeInTheDocument()
    const periodo = screen.getByRole('group', { name: 'Período do Em alta' })
    expect(within(periodo).getByText('7 dias')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Em alta' })).toHaveAttribute('aria-current', 'page')
  })
  it('em Recentes não há nota nem período', async () => {
    await abrir()
    expect(screen.queryByText(/contam pessoas diferentes/)).toBeNull()
    expect(screen.queryByRole('group', { name: 'Período do Em alta' })).toBeNull()
  })
  it('um endereço escrito à mão com ordem por pessoas num relé antigo cai em Recentes, sem os links novos', async () => {
    atual = comoRele031(atual)
    await abrir({ ordem: 'melhores' })
    expect(links('Ordem das conversas')).toEqual(['Recentes', 'Ativas', 'Sem resposta'])
    expect(screen.getByRole('link', { name: 'Recentes' })).toHaveAttribute('aria-current', 'page')
  })
  it('chips de status e de etiqueta, com filtro; o status selecionado fica marcado e o vazio tem texto próprio', async () => {
    await abrir({ status: 'respondido' })
    const st = screen.getByRole('group', { name: 'Status' })
    expect(within(st).getAllByRole('link').map((a) => a.textContent?.replace('Status:', ''))).toEqual(['Todas', 'Aberto', 'Respondido', 'Encerrado'])
    expect(within(st).getByText('Respondido').closest('a')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('group', { name: 'Etiquetas' })).toBeInTheDocument()
    expect(screen.getAllByText('Pipoca').length).toBeGreaterThan(0)
  })
  it('filtro sem resultado diz "Nada com essa marca"', async () => {
    await abrir({ status: 'aberto', etiqueta: 'pipoca' })
    expect(screen.getByText('Nada com essa marca')).toBeInTheDocument()
  })
  it('chave que a comunidade não tem no vocabulário é ignorada (vira sem filtro)', async () => {
    await abrir({ status: 'inventado', etiqueta: '<script>' })
    expect(screen.queryByText('Nada com essa marca')).toBeNull()
  })
  it('relé antigo: sem chips e sem marcas', async () => {
    atual = comoRele031(atual)
    await abrir()
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Etiquetas' })).toBeNull()
  })
  it('comunidade sem vocabulário próprio mostra o status padrão', async () => {
    await abrir({}, COMUNIDADES.tabuleiro)
    const st = screen.getByRole('group', { name: 'Status' })
    expect(within(st).getByText('Em andamento')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Etiquetas' })).toBeNull()
  })
  it('em inglês os rótulos são os do inglês', async () => {
    await tela(ComunidadePagina({ params: Promise.resolve({ lang: 'en', id: COMUNIDADES.cinema }), searchParams: Promise.resolve({}) }))
    expect(links('Order of conversations')).toContain('Trending')
  })
})

describe('página do tópico', () => {
  const abrir = (sp: Record<string, string> = {}, id = TOPICOS.cinemaPipoca) => tela(TopicoPagina({ params: Promise.resolve({ ...lang, id }), searchParams: Promise.resolve(sp) }))
  it('mostra o status e as etiquetas resolvidos pelo vocabulário da comunidade', async () => {
    await abrir()
    expect(screen.getByText('Respondido')).toBeInTheDocument()
    expect(screen.getByText('Sessão de sábado')).toBeInTheDocument()
  })
  it('a ordem das respostas: cronológica por padrão, Melhores e Em alta como links, e o marcado fica marcado', async () => {
    await abrir({ ordem: 'melhores' })
    expect(links('Ordem das respostas')).toEqual(['Cronológica', 'Melhores', 'Em alta'])
    expect(screen.getByRole('link', { name: 'Melhores' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Cronológica' })).toHaveAttribute('href', `/pt/t/${TOPICOS.cinemaPipoca}#respostas-t`)
    expect(screen.getByRole('link', { name: 'Melhores' })).toHaveAttribute('href', `/pt/t/${TOPICOS.cinemaPipoca}?ordem=melhores#respostas-t`)
  })
  it('em alta no tópico leva o período e o link de 7 dias leva a janela', async () => {
    await abrir({ ordem: 'em-alta', janela: '7d' })
    expect(within(screen.getByRole('group', { name: 'Período do Em alta' })).getByText('7 dias')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('24 horas')).toHaveAttribute('href', `/pt/t/${TOPICOS.cinemaPipoca}?ordem=em-alta#respostas-t`)
  })
  it('relé antigo: nada de seletor e nada de marca', async () => {
    atual = comoRele031(atual)
    await abrir({ ordem: 'melhores' })
    expect(screen.queryByRole('navigation', { name: 'Ordem das respostas' })).toBeNull()
    expect(screen.queryByText('Respondido')).toBeNull()
  })
})

describe('busca de tópicos', () => {
  const abrir = (sp: Record<string, string>) => tela(Buscar({ params: Promise.resolve(lang), searchParams: Promise.resolve({ q: 'pipoca', tipo: 'topicos', ...sp }) }))
  it('com o relé 0.3.2 oferece a ordem; sem ele, não', async () => {
    await abrir({ ordem: 'recentes' })
    expect(links('Ordem dos tópicos')).toEqual(['Mais parecidos', 'Mais novos', 'Melhores', 'Em alta'])
    expect(screen.getByRole('link', { name: 'Mais novos' })).toHaveAttribute('aria-current', 'page')
  })
  it('relé antigo: sem seletor', async () => {
    atual = comoRele031(atual)
    await abrir({ ordem: 'recentes' })
    expect(screen.queryByRole('navigation', { name: 'Ordem dos tópicos' })).toBeNull()
  })
  it('a ordem não aparece nas outras abas', async () => {
    await abrir({ tipo: 'rovers' })
    expect(screen.queryByRole('navigation', { name: 'Ordem dos tópicos' })).toBeNull()
  })
})

describe('anúncios do relé na página inicial', () => {
  it('o cartão aparece com o fixado e o outro; tem a nota de texto puro', async () => {
    await tela(Linha({ params: Promise.resolve(lang) }))
    const sec = screen.getByRole('region', { name: 'Do relé' })
    expect(within(sec).getByText('Como a rede ordena as conversas')).toBeInTheDocument()
    expect(within(sec).getByText('O relé agora fala a revisão 0.3.2')).toBeInTheDocument()
    expect(within(sec).getByText('Fixado')).toBeInTheDocument()
    expect(within(sec).getByText(/Texto puro, escrito por quem opera o relé/)).toBeInTheDocument()
  })
  it('relé antigo: sem cartão', async () => {
    atual = comoRele031(atual)
    await tela(Linha({ params: Promise.resolve(lang) }))
    expect(screen.queryByRole('region', { name: 'Do relé' })).toBeNull()
  })
  it('o texto do anúncio é texto: marcação e link não viram elemento', () => {
    const a = { id: 'an_AAAAAAAAAAAAAAAAAAAAAA', titulo: '<b>Aviso</b>', texto: '<img src=x onerror=alert(1)> [link](http://x.com) http://x.com', criadoEm: RELOGIO.toISOString(), fixado: false }
    const { container } = render(<AnunciosDoRele itens={[a]} d={dict('pt')} agora={RELOGIO.toISOString()} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
  it('só o fixado leva o selo "Fixado"; a data de publicação sai preenchida, sem a marca do texto', () => {
    const base = { id: 'an_AAAAAAAAAAAAAAAAAAAAAA', titulo: 'T', texto: 'curto', criadoEm: new Date(RELOGIO.getTime() - 2 * 3600_000).toISOString() }
    const { container } = render(<AnunciosDoRele itens={[{ ...base, fixado: true }, { ...base, id: 'an_BBBBBBBBBBBBBBBBBBBBBB', fixado: false }]} d={dict('pt')} agora={RELOGIO.toISOString()} />)
    expect(screen.getAllByText('Fixado')).toHaveLength(1)
    const itens = container.querySelectorAll('li.anuncio')
    expect(itens[0].querySelector('.pilula')).not.toBeNull()
    expect(itens[1].querySelector('.pilula')).toBeNull()
    expect(container.textContent).not.toContain('{quando}')
    expect(container.textContent).toMatch(/publicado há 2 h|publicado há 2 horas/)
  })
  it('anúncio longo fica atrás de "Ler o anúncio inteiro"; o curto aparece aberto; lista vazia não desenha nada', () => {
    const base = { id: 'an_AAAAAAAAAAAAAAAAAAAAAA', titulo: 'T', criadoEm: RELOGIO.toISOString(), fixado: false }
    const { container, unmount } = render(<AnunciosDoRele itens={[{ ...base, texto: 'x'.repeat(241) }]} d={dict('pt')} agora={RELOGIO.toISOString()} />)
    expect(container.querySelector('details')).not.toBeNull()
    unmount()
    const r2 = render(<AnunciosDoRele itens={[{ ...base, texto: 'x'.repeat(240) }]} d={dict('pt')} agora={RELOGIO.toISOString()} />)
    expect(r2.container.querySelector('details')).toBeNull()
    r2.unmount()
    expect(render(<AnunciosDoRele itens={[]} d={dict('pt')} agora={RELOGIO.toISOString()} />).container.innerHTML).toBe('')
  })
})

describe('chips', () => {
  const voc = { etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' as const }], status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde' as const, categorias: null }], padrao: false }
  it('a cor vai no data-cor, o status leva rótulo para leitor de tela, e chave sem vocabulário não vira código na tela', () => {
    const { container } = render(<Marcas marcas={{ etiquetas: ['bug', 'sumiu'], status: 'aberto' }} vocabulario={voc} d={dict('pt')} />)
    expect(container.querySelector('[data-tipo="status"]')).toHaveAttribute('data-cor', 'verde')
    expect(container.querySelector('[data-tipo="status"] .so-leitor')).toHaveTextContent('Status:')
    expect(container.querySelector('[data-tipo="etiqueta"]')).toHaveAttribute('data-cor', 'vermelho')
    expect(container.textContent).not.toContain('sumiu')
  })
  it('sem vocabulário ou sem marca não desenha nada; cor fora da lista vira cinza', () => {
    expect(render(<Marcas marcas={{ etiquetas: ['bug'], status: null }} d={dict('pt')} />).container.innerHTML).toBe('')
    expect(render(<Marcas vocabulario={voc} d={dict('pt')} />).container.innerHTML).toBe('')
    const { container } = render(<ChipDeEtiqueta e={{ chave: 'x1', rotulo: 'X', cor: 'dourado' as never }} />)
    expect(container.querySelector('.voc-chip')).toHaveAttribute('data-cor', 'cinza')
  })
})
