// As PÁGINAS (componentes de servidor) da revisão 0.3.1 montadas de verdade em cima do cliente de demonstração, e do mesmo cliente "como relé 0.3"
// (sem os campos novos e sem os recursos): a tela nova aparece com o relé novo e some, sem quebrar, com o relé antigo.
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  redirect: vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`) }),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound, redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao: vi.fn(), maisAcao: vi.fn(), proporAcao: vi.fn(), marcarAvisosVistosAcao: vi.fn(async () => undefined) }))
vi.mock('@/app/acoes', () => ({ reagirAcao: vi.fn(), apagarAcao: vi.fn(), seguirAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { ClienteFalso } from '@/lib/cliente-falso'
import { COMUNIDADES, TOPICOS, OBJETOS } from '@/lib/social/demo-ids'
import { uidDe } from '@/lib/demo-dados'
import { oid } from '@/lib/demo-dados'

const RELOGIO = new Date('2026-11-05T15:00:00.000Z')
let falso: ClienteFalso
/** O cliente de demonstração faz de conta que o relé é 0.3: nenhum recurso, e os campos novos somem das respostas. */
function comoRele03(c: ClienteFalso) {
  const x = Object.create(c) as ClienteFalso
  x.suporta = async () => false
  x.info = async () => ({ protocolo: ['0.3'], social: true, recursos: [] })
  x.removidos = async () => ({ itens: [] })
  x.depoimentosEnviados = async () => ({ itens: [] })
  x.temasDePaginas = async () => []
  const tira = <T extends object>(o: T, chaves: string[]): T => {
    const n = { ...o } as Record<string, unknown>
    for (const k of chaves) delete n[k]
    return n as T
  }
  const paginaDoRover = c.paginaDoRover.bind(c)
  x.paginaDoRover = async (ref: string) => {
    const p = await paginaDoRover(ref)
    return { ...p, contagens: tira(p.contagens, ['seguidores', 'seguindo']), voce: p.voce ? tira(p.voce, ['amigoDesde', 'contaDesde', 'selosQueDei']) : null }
  }
  const comunidade = c.comunidade.bind(c)
  x.comunidade = async (id: string) => {
    const k = await comunidade(id)
    return { ...k, voce: k.voce ? tira(k.voce, ['banidoEm', 'membroDesde']) : null } as typeof k
  }
  const topico = c.topico.bind(c)
  x.topico = async (id: string) => tira(await topico(id), ['reacoes', 'minhaReacao'])
  const emAlta = c.emAlta.bind(c) as (t: string, j?: string) => Promise<unknown[]>
  x.emAlta = (async (t: string, j?: string) => (await emAlta(t, j)).map((i) => tira(i as object, ['pessoas']))) as typeof x.emAlta
  return x
}
let atual: ClienteFalso
vi.mock('@/lib/obter-rede', () => ({ obterRede: () => ({ cliente: atual, ponte: atual }) }))

import Avisos from '@/app/[lang]/avisos/page'
import ComunidadePagina from '@/app/[lang]/comunidades/[id]/page'
import Moderacao from '@/app/[lang]/comunidades/[id]/moderacao/page'
import NovoTopico from '@/app/[lang]/comunidades/[id]/novo/page'
import Descobrir from '@/app/[lang]/descobrir/page'
import Paginas from '@/app/[lang]/paginas/page'
import Perfil from '@/app/[lang]/r/[handle]/page'
import { SobrePerfil } from '@/components/perfil/FichaPerfil'
import TopicoPagina from '@/app/[lang]/t/[id]/page'

const tela = async (jsx: Promise<React.ReactElement>) => render(await jsx)
const lang = { lang: 'pt' }

beforeEach(() => {
  // As telas leem o relógio real em alguns pontos (prazo de apelação, carência de selo). Sem fixá-lo, os testes deste arquivo passam a
  // falhar sozinhos quando o calendário anda (aconteceu em 11/11 e em 17/11/2026, com o RELOGIO em 05/11). Quem precisa de outro relógio
  // chama useFakeTimers de novo dentro do próprio teste.
  vi.useFakeTimers({ now: RELOGIO, toFake: ['Date'] })
  notFound.mockClear()
  falso = new ClienteFalso(() => RELOGIO)
  atual = falso
})
afterEach(() => {
  vi.useRealTimers()
})

describe('moderação: dispensar denúncia', () => {
  const abrir = () => tela(Moderacao({ params: Promise.resolve({ ...lang, id: COMUNIDADES.vitrola }), searchParams: Promise.resolve({ aba: 'fila' }) }))
  it('com o relé 0.3.1 cada denúncia da fila tem "Dispensar a denúncia" e a nota honesta do que isso faz', async () => {
    await abrir()
    expect(screen.getAllByRole('button', { name: 'Dispensar a denúncia' })).toHaveLength(3)
    expect(screen.getAllByText(/Dispensar tira o caso da fila e deixa o conteúdo no ar/).length).toBe(3)
    expect(screen.queryByText(/A denúncia continua na fila/)).toBeNull()
  })
  it('com o relé 0.3 o botão nem existe e fica o texto de antes ("a denúncia continua na fila")', async () => {
    atual = comoRele03(falso)
    await abrir()
    expect(screen.queryByRole('button', { name: 'Dispensar a denúncia' })).toBeNull()
    expect(screen.getAllByText(/Não fazer nada deixa o conteúdo no ar/).length).toBe(3)
  })
  it('o que ficou na fila depois de dispensar uma denúncia: uma a menos, e o conteúdo continua lá', async () => {
    await falso.agir({ tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo: OBJETOS.respostaParaModerar })
    await abrir()
    expect(screen.getAllByRole('button', { name: 'Dispensar a denúncia' })).toHaveLength(2)
  })
})

describe('páginas: filtro de temas', () => {
  const abrir = () => tela(Paginas({ params: Promise.resolve(lang), searchParams: Promise.resolve({}) }))
  it('com a lista de temas do relé os chips trazem quantas páginas cada tema tem', async () => {
    await abrir()
    const grupo = screen.getByRole('group', { name: /tema/i })
    expect(within(grupo).getByRole('link', { name: /#nuvens\s*1/ })).toBeInTheDocument()
    expect(within(grupo).getByRole('link', { name: /#cafe\s*1/ })).toBeInTheDocument()
  })
  it('com o relé 0.3 os chips saem das páginas que a tela já carregou, sem contagem', async () => {
    atual = comoRele03(falso)
    await abrir()
    const grupo = screen.getByRole('group', { name: /tema/i })
    const link = within(grupo).getByRole('link', { name: '#nuvens' })
    expect(link.textContent).toBe('#nuvens')
  })
})

describe('tópico: reações', () => {
  const abrir = () => tela(TopicoPagina({ params: Promise.resolve({ ...lang, id: TOPICOS.cinemaPipoca }) }))
  it('a Lumi (membro) vê a barra com as contagens e reage; a reação dele fica marcada', async () => {
    await abrir()
    const grupo = screen.getByRole('group', { name: 'Reações a este tópico' })
    expect(within(grupo).getByRole('button', { name: 'Curtir: 6' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).getByRole('button', { name: 'Útil: 3' })).toBeInTheDocument()
  })
  it('depois de reagir, a página mostra a reação dele', async () => {
    await falso.reagir(TOPICOS.cinemaPipoca, 'curtir')
    await abrir()
    const grupo = screen.getByRole('group', { name: 'Reações a este tópico' })
    expect(within(grupo).getByRole('button', { name: 'Curtir: 7' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('com o relé 0.3 o tópico não traz as contagens e a barra NEM aparece', async () => {
    atual = comoRele03(falso)
    await abrir()
    expect(screen.queryByRole('group', { name: 'Reações a este tópico' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('perfil: selos, datas e contagens', () => {
  // A página do perfil monta abas ASSÍNCRONAS (mural, depoimentos...) que o jsdom não renderiza. Então se roda a página inteira (os dados e a fiação de verdade)
  // e se monta, com o que ela devolveu, só a FICHA, que é onde moram os selos e as contagens.
  type Elem = { props?: { children?: unknown } }
  // Na folgali a ficha se dividiu em duas: o cabeçalho (FichaPerfil) e o cartão "Sobre" da coluna da esquerda (SobrePerfil),
  // onde moram os selos e as contagens. Monta as duas.
  const achar = (e: unknown): React.ReactElement | null => {
    if (!e || typeof e !== 'object') return null
    const el = e as React.ReactElement<{ children?: unknown }>
    if (el.type === SobrePerfil) return el
    for (const x of [el.props?.children].flat(9)) {
      const r = achar(x)
      if (r) return r
    }
    return null
  }
  async function ficha(handle = 'pipa') {
    const raiz = (await Perfil({ params: Promise.resolve({ ...lang, handle }), searchParams: Promise.resolve({}) })) as unknown as Elem
    const filhos = raiz.props?.children as Elem[]
    return { cab: filhos[0] as unknown as React.ReactElement<{ pode: string }>, sobre: achar(raiz) }
  }
  const montar = async (handle = 'pipa') => {
    const { cab, sobre } = await ficha(handle)
    render(<>{cab}{sobre}</>)
    return cab.props.pode
  }
  it('seguidores E seguindo na ficha, com os números do relé', async () => {
    await montar('pipa')
    const dl = document.querySelector('dl.pf-contagens') as HTMLElement
    expect(within(dl).getByText('Seguidores').nextElementSibling?.textContent).toBe('219')
    expect(within(dl).getByText('Seguindo').nextElementSibling?.textContent).toBe('5')
  })
  it('o selo que a Lumi já deu perde o botão; os outros continuam', async () => {
    await falso.agir({ tipo: 'selo', alvo: uidDe('pipa'), selo: 'rapido' })
    expect(await montar('pipa')).toBe('sim')
    const medalhas = document.querySelector('.pf-medalhas') as HTMLElement
    const rapido = within(medalhas).getAllByRole('listitem').find((li) => within(li).queryByText('Rápido', { selector: 'strong' }))!
    expect(within(rapido).queryByRole('button')).toBeNull()
    expect(within(rapido).getByText('Dado')).toBeInTheDocument()
    expect(within(medalhas).getAllByRole('button')).toHaveLength(3)
  })
  it('com o relé 0.3 todos os selos têm botão e as contagens usam o número do perfil (sem quebrar)', async () => {
    atual = comoRele03(falso)
    expect(await montar('pipa')).toBe('sim')
    expect(within(document.querySelector('.pf-medalhas') as HTMLElement).getAllByRole('button')).toHaveLength(4)
    const dl = document.querySelector('dl.pf-contagens') as HTMLElement
    expect(within(dl).getByText('Seguidores').nextElementSibling?.textContent).toBeTruthy()
  })
  it('amizade que ainda não tem 7 dias: a tela diz a DATA em que poderá dar selo (relé 0.3.1) e some o botão', async () => {
    // a Mimi virou amiga da Lumi há 2 dias: o selo só vale 7 dias depois (daqui a 5), e a conta da Lumi já é antiga
    // a tela lê o relógio real em alguns pontos: sem fixá-lo aqui, o teste passa a falhar no dia em que o relógio passa de RELOGIO + 5 dias
    // (aconteceu em 11/11/2026, com o RELOGIO em 05/11)
    vi.useFakeTimers({ now: RELOGIO, toFake: ['Date'] })
    try {
      const mimi = new ClienteFalso(() => RELOGIO)
      mimi.social.amizades.push({ a: uidDe('lumi'), b: uidDe('mimi'), desde: RELOGIO.getTime() - 2 * 86_400_000 })
      atual = mimi
      expect(await montar('mimi')).toBe('sem-tempo')
      expect(screen.getByText(/Você poderá dar selo a partir de/)).toBeInTheDocument()
      expect(within(document.querySelector('.pf-medalhas') as HTMLElement).queryAllByRole('button')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
  it('as datas do relé dispensam as chamadas extras que o contorno de antes fazia (lista de amigos e perfil do leitor)', async () => {
    const amigos = vi.spyOn(falso, 'amigos')
    await ficha('pipa')
    expect(amigos).not.toHaveBeenCalled()
    atual = comoRele03(falso)
    const amigos03 = vi.spyOn(atual, 'amigos')
    await ficha('pipa')
    expect(amigos03).toHaveBeenCalled()
  })
})

describe('avisos: o que foi removido', () => {
  const abrir = () => tela(Avisos({ params: Promise.resolve(lang) }))
  it('com o relé 0.3.1 a seção lista o que foi removido, o papel, o motivo, o trecho retido e o caminho de apelar', async () => {
    await abrir()
    const secao = screen.getByRole('heading', { name: /O que foi removido/ }).closest('section')!
    expect(within(secao).getByText(/por a pessoa dona/)).toBeInTheDocument()
    expect(within(secao).getByText('Propaganda ou repetição')).toBeInTheDocument()
    expect(within(secao).getByText(/laços/)).toBeInTheDocument()
    expect(within(secao).getByRole('link', { name: 'Apelar' })).toHaveAttribute('href', `/pt/comunidades/${COMUNIDADES.praia}/apelar?alvo=${oid('tpraialumi')}`)
  })
  it('com o relé 0.3 a seção não aparece e os avisos continuam', async () => {
    atual = comoRele03(falso)
    await abrir()
    expect(screen.queryByRole('heading', { name: /O que foi removido/ })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Avisos' })).toBeInTheDocument()
  })
})

describe('comunidade onde a Lumi foi banido: prazo da apelação', () => {
  const abrir = () => tela(ComunidadePagina({ params: Promise.resolve({ ...lang, id: COMUNIDADES.praia }), searchParams: Promise.resolve({}) }))
  it('com `banidoEm` do relé a tela diz os dias que restam, SEM ler o registro público', async () => {
    // a tela conta os dias com o relógio real: sem fixá-lo em RELOGIO, o teste passou a falhar quando o relógio passou do prazo de
    // apelação contado a partir do banimento da semente (visto em 17/11/2026; o mesmo defeito do teste do selo acima)
    vi.useFakeTimers({ now: RELOGIO, toFake: ['Date'] })
    const registro = vi.spyOn(falso, 'registroDaComunidade')
    await abrir()
    expect(screen.getByText(/Faltam \d+ dias? para o prazo de apelação/)).toBeInTheDocument()
    expect(registro).not.toHaveBeenCalled()
  })
  it('com o relé 0.3 a data vem do registro público, como antes', async () => {
    atual = comoRele03(falso)
    const registro = vi.spyOn(atual, 'registroDaComunidade')
    await abrir()
    expect(registro).toHaveBeenCalled()
  })
})

describe('novo tópico: carência de membro com os minutos que faltam', () => {
  it('quem entrou há 20 minutos vê "tópicos e votos abrem em 40 minutos" (relé 0.3.1) e o formulário continua', async () => {
    const voce = (await falso.comunidade(COMUNIDADES.cozinha)).voce
    expect(voce?.membroDesde).toBeTruthy()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.parse(voce!.membroDesde!) + 20 * 60_000))
    await tela(NovoTopico({ params: Promise.resolve({ ...lang, id: COMUNIDADES.cozinha }), searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Você entrou há pouco: tópicos e votos abrem em 40 minutos.')).toBeInTheDocument()
  })
  it('passada a hora, o aviso some', async () => {
    const voce = (await falso.comunidade(COMUNIDADES.cozinha)).voce
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.parse(voce!.membroDesde!) + 61 * 60_000))
    await tela(NovoTopico({ params: Promise.resolve({ ...lang, id: COMUNIDADES.cozinha }), searchParams: Promise.resolve({}) }))
    expect(screen.queryByText(/Você entrou há pouco/)).toBeNull()
  })
  it('com o relé 0.3 não há data de entrada e a tela não inventa carência', async () => {
    atual = comoRele03(falso)
    await tela(NovoTopico({ params: Promise.resolve({ ...lang, id: COMUNIDADES.cozinha }), searchParams: Promise.resolve({}) }))
    expect(screen.queryByText(/Você entrou há pouco/)).toBeNull()
  })
})

describe('descobrir: pessoas no em alta', () => {
  const abrir = () => tela(Descobrir({ searchParams: Promise.resolve({}), params: Promise.resolve(lang) } as never))
  it('cada item em alta diz quantas pessoas o moveram (só o número)', async () => {
    await abrir()
    expect(screen.getAllByText(/pessoas? (respondeu|responderam)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/pessoas? em movimento/).length).toBeGreaterThan(0)
  })
  it('com o relé 0.3 os itens aparecem sem a contagem', async () => {
    atual = comoRele03(falso)
    await abrir()
    expect(screen.queryByText(/pessoas? (respondeu|responderam)/)).toBeNull()
    expect(screen.queryByText(/pessoas? em movimento/)).toBeNull()
  })
})
