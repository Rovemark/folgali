import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGORA, pipa, postagem, lumi } from './ajuda'

const { agirAcao, maisAcao, reagirAcao, push } = vi.hoisted(() => ({
  agirAcao: vi.fn(async (...args: unknown[]) => { void args; return { ok: true as const } }),
  maisAcao: vi.fn(async (...args: unknown[]) => { void args; return null as unknown }),
  reagirAcao: vi.fn(async () => ({ ok: true })),
  push: vi.fn(),
}))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao, maisAcao, proporAcao: vi.fn(), marcarAvisosVistosAcao: vi.fn() }))
vi.mock('@/app/acoes', () => ({ reagirAcao, apagarAcao: vi.fn(), seguirAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => '/pt' }))

import BotaoSeguirPagina from '@/components/paginas/BotaoSeguirPagina'
import CartaoAtualizacao from '@/components/paginas/CartaoAtualizacao'
import CartaoPagina from '@/components/paginas/CartaoPagina'
import CartaoTopicoMini from '@/components/paginas/CartaoTopicoMini'
import Destaque from '@/components/paginas/Destaque'
import GerirPagina from '@/components/paginas/GerirPagina'
import LinhaMista from '@/components/paginas/LinhaMista'
import ListaBusca from '@/components/paginas/ListaBusca'
import { ItemRegistro } from '@/components/paginas/ListaRegistro'
import { dict } from '@/lib/i18n'
import type { Atualizacao, PaginaCartao, PaginaProjeto, RegistroModeracao, TopicoCartao } from '@/lib/social/tipos'

const d = dict('pt')
const PAGINA = 'ob_DEMOgnuvens00000000000000000000000000000000'
const ATU = 'ob_DEMOatmapa1000000000000000000000000000000'

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const cartao = (extra: Partial<PaginaCartao> = {}): PaginaCartao => ({ id: PAGINA, nome: 'Caçadores de Nuvens', descricao: 'Diário de quem caça nuvem com cara de bicho.', tema: 'nuvens', dono: pipa, seguidores: 149, criadaEm: '2026-10-13T10:00:00.000Z', atividadeEm: '2026-11-04T14:00:00.000Z', ...extra })
const atu = (extra: Partial<Atualizacao> = {}): Atualizacao => ({ id: ATU, pagina: PAGINA, paginaNome: 'Caçadores de Nuvens', autor: pipa, titulo: 'Excursão 7', texto: 'Mapa feito, falei com @seixo e vi https://exemplo.com/mapa #mapas', tags: ['mapas'], criadaEm: '2026-11-04T13:00:00.000Z', reacoes: { curtir: 8, util: 4 }, minhaReacao: null, ...extra })

describe('CartaoPagina', () => {
  it('mostra o nome, o tema, o dono e os seguidores, e o cartão inteiro leva à página', () => {
    render(<CartaoPagina p={cartao()} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('heading', { name: 'Caçadores de Nuvens' })).toBeInTheDocument()
    expect(screen.getByText('#nuvens')).toBeInTheDocument()
    expect(screen.getByText('de Pipa')).toBeInTheDocument()
    expect(screen.getByText('149 seguidores')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Caçadores de Nuvens' })).toHaveAttribute('href', `/pt/paginas/${PAGINA}`)
  })
  it('marca o termo buscado sem HTML, mesmo que o nome tente injetar', () => {
    const { container } = render(<CartaoPagina p={cartao({ nome: 'Mapa <img src=x onerror=alert(1)>' })} d={d} lang="pt" agora={AGORA} termo="mapa" />)
    expect(container.querySelector('mark')?.textContent).toBe('Mapa')
    // o emblema da página é uma foto; o que não pode existir é a imagem injetada pelo nome
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
  it('mostra a relação da pessoa com a página quando vem', () => {
    render(<CartaoPagina p={cartao()} d={d} lang="pt" agora={AGORA} relacao="administrador" />)
    expect(screen.getByText('Administra')).toBeInTheDocument()
  })
})

describe('CartaoAtualizacao: o menu muda com o papel de quem olha', () => {
  const itens = () => screen.getAllByRole('button').map((b) => (b.textContent ?? '').trim())
  it('o autor só pode apagar a própria atualização (e não denuncia a si mesmo)', () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} meuUid={pipa.uid} />)
    expect(itens()).toContain('Apagar a minha atualização')
    expect(itens()).not.toContain('Denunciar')
    expect(itens()).not.toContain('Remover da página')
  })
  it('o dono da página remove a de outro e também pode denunciar', () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} meuUid={lumi.uid} souDonoDaPagina />)
    expect(itens()).toContain('Remover da página')
    expect(itens()).toContain('Denunciar')
    expect(itens()).not.toContain('Apagar a minha atualização')
  })
  it('qualquer outra pessoa só denuncia', () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} meuUid={lumi.uid} />)
    expect(itens().filter((t) => ['Denunciar', 'Remover da página', 'Apagar a minha atualização'].includes(t ?? ''))).toEqual(['Denunciar'])
  })
  it('desenha menção, tag e link como o texto social manda, e o domínio inteiro aparece', () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} meuUid={lumi.uid} />)
    expect(screen.getByRole('link', { name: '@seixo' })).toHaveAttribute('href', '/pt/r/seixo')
    expect(screen.getByRole('link', { name: /exemplo\.com/ })).toHaveAttribute('href', 'https://exemplo.com/mapa')
    expect(screen.getAllByRole('link', { name: /mapas/ })[0]).toHaveAttribute('href', `/pt/buscar?q=${encodeURIComponent('#mapas')}`)
  })
  it('na linha mostra de qual página veio', () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} comPagina noFio />)
    expect(screen.getByRole('link', { name: /Caçadores de Nuvens/ })).toHaveAttribute('href', `/pt/paginas/${PAGINA}`)
  })
  it('apagar pede confirmação e depois manda remocao-pelo-autor', async () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} meuUid={pipa.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a minha atualização' }))
    expect(agirAcao).not.toHaveBeenCalled()
    const dlg = screen.getByRole('dialog')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Apagar' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'remocao-pelo-autor', alvo: ATU })
  })
  it('o dono remove com um motivo da lista e o motivo vai no ato', async () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} meuUid={lumi.uid} souDonoDaPagina />)
    await userEvent.click(screen.getByRole('button', { name: 'Remover da página' }))
    const dlg = screen.getByRole('dialog')
    await userEvent.click(within(dlg).getByLabelText('Contra as regras da casa'))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remover' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'remocao-por-responsavel', alvo: ATU, motivo: 'regras' })
  })
  it('a denúncia leva só o alvo e o motivo, nada de quem denuncia', async () => {
    render(<CartaoAtualizacao a={atu()} d={d} lang="pt" agora={AGORA} meuUid={lumi.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Denunciar' }))
    const dlg = screen.getByRole('dialog')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Enviar denúncia' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'denuncia', alvo: ATU, motivo: 'spam' })
  })
})

describe('BotaoSeguirPagina', () => {
  it('seguir manda pagina-seguir/seguir; já seguindo manda deixar', async () => {
    const { rerender } = render(<BotaoSeguirPagina pagina={PAGINA} segue={false} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(agirAcao).toHaveBeenLastCalledWith({ tipo: 'pagina-seguir', pagina: PAGINA, acao: 'seguir' })
    rerender(<BotaoSeguirPagina pagina={PAGINA} segue d={d} />)
    const b = screen.getByRole('button', { name: 'Seguindo' })
    expect(b).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(b)
    expect(agirAcao).toHaveBeenLastCalledWith({ tipo: 'pagina-seguir', pagina: PAGINA, acao: 'deixar' })
  })
  it('mostra o motivo quando o relé recusa', async () => {
    agirAcao.mockResolvedValueOnce({ ok: false, codigo: 'limite-de-estrutura' } as never)
    render(<BotaoSeguirPagina pagina={PAGINA} segue={false} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('limite de itens')
  })
})

describe('GerirPagina: dono e administrador não mexem nas mesmas coisas', () => {
  const pagina = (): PaginaProjeto => ({ ...cartao(), administradores: [{ ...pipa, uid: 'rvr_DEMOseixo00000000000', handle: 'seixo', nome: 'Seixo' }], voce: { segue: false, papel: 'dono' } })
  const amigo = { ...pipa, uid: 'rvr_DEMOnina000000000000', handle: 'nina', nome: 'Nina' }
  it('o dono vê tirar administrador, chamar amigo e apagar a página', () => {
    render(<GerirPagina p={pagina()} d={d} lang="pt" papel="dono" candidatos={[amigo]} podeEscrever />)
    expect(screen.getByRole('button', { name: 'Tirar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chamar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apagar a página' })).toBeInTheDocument()
  })
  it('o administrador edita os dados, mas não gere administradores nem apaga a página', () => {
    render(<GerirPagina p={pagina()} d={d} lang="pt" papel="administrador" candidatos={[amigo]} podeEscrever />)
    expect(screen.getByRole('button', { name: 'Pedir a mudança' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tirar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Chamar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apagar a página' })).toBeNull()
    expect(screen.getByText(/só da dona ou do dono/i)).toBeInTheDocument()
  })
  it('chamar administrador manda o amigo escolhido', async () => {
    render(<GerirPagina p={pagina()} d={d} lang="pt" papel="dono" candidatos={[amigo]} podeEscrever />)
    await userEvent.click(screen.getByRole('button', { name: 'Chamar' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'pagina-gestao', pagina: PAGINA, alvo: amigo.uid, acao: 'adicionar-admin' })
  })
  it('apagar a página pede confirmação, manda remocao-pelo-autor da PÁGINA e volta para a lista', async () => {
    render(<GerirPagina p={pagina()} d={d} lang="pt" papel="dono" candidatos={[]} podeEscrever />)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a página' }))
    expect(agirAcao).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar a página' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'remocao-pelo-autor', alvo: PAGINA })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/pt/paginas'))
  })
  it('sem amigo para chamar, explica por quê em vez de mostrar uma lista vazia', () => {
    render(<GerirPagina p={pagina()} d={d} lang="pt" papel="dono" candidatos={[]} podeEscrever />)
    expect(screen.getByText(/precisa ser sua amiga/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chamar' })).toBeNull()
  })
  it('sem o app pareado o formulário fica só de leitura', () => {
    render(<GerirPagina p={pagina()} d={d} lang="pt" papel="dono" candidatos={[]} podeEscrever={false} />)
    expect(screen.getByRole('button', { name: 'Pedir a mudança' })).toBeDisabled()
  })
})

describe('LinhaMista', () => {
  const posts = Array.from({ length: 5 }, (_, i) => ({ tipo: 'postagem' as const, postagem: postagem({ id: `ob_DEMOp0${i}000000000000000000000000000000000000`, texto: `Postagem número ${i}` }) }))
  it('mistura postagem e atualização na ordem recebida, com o nome da página', () => {
    render(<LinhaMista inicial={{ itens: [posts[0], { tipo: 'atualizacao', atualizacao: atu() }, posts[1]] }} d={d} lang="pt" agora={AGORA} />)
    const textos = screen.getAllByRole('article').map((a) => a.textContent ?? '')
    expect(textos[0]).toContain('Postagem número 0')
    expect(textos[1]).toContain('Excursão 7')
    expect(textos[2]).toContain('Postagem número 1')
    expect(screen.getByText('Página')).toBeInTheDocument()
  })
  it('as sugestões entram depois do quarto item, uma vez só', () => {
    render(<LinhaMista inicial={{ itens: posts }} d={d} lang="pt" agora={AGORA} sugestoes={<aside>SUGESTÕES</aside>} />)
    const todos = [...document.querySelectorAll('.linha-item')]
    expect(screen.getAllByText('SUGESTÕES')).toHaveLength(1)
    expect(todos[3].textContent).toContain('SUGESTÕES')
    expect(todos[2].textContent).not.toContain('SUGESTÕES')
  })
  it('"Ver mais" pede a próxima página da linha mista e junta sem repetir', async () => {
    maisAcao.mockResolvedValueOnce({ itens: [posts[4], posts[1]], proximo: undefined })
    render(<LinhaMista inicial={{ itens: [posts[0], posts[1]], proximo: 'c1' }} d={d} lang="pt" agora={AGORA} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(maisAcao).toHaveBeenCalledWith({ lista: 'linhaMista', de: undefined, opcoes: undefined, cursor: 'c1' })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull()
  })
  it('falha ao carregar mais mostra o aviso e deixa tentar de novo', async () => {
    maisAcao.mockResolvedValueOnce(null)
    render(<LinhaMista inicial={{ itens: [posts[0]], proximo: 'c1' }} d={d} lang="pt" agora={AGORA} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeEnabled()
  })
})

describe('ListaBusca', () => {
  const topico: TopicoCartao = { id: 'ob_DEMOtcinemapipoca00000000000000000000000000', comunidade: 'ob_DEMOccinema00000000000000000000000000000000', comunidadeNome: 'Cinema de Sofá', categoria: null, titulo: 'Nome de backup', trecho: 'Tenho pastas', autor: pipa, criadoEm: '2026-11-04T10:00:00.000Z', atividadeEm: '2026-11-04T10:00:00.000Z', respostas: 3, fixado: false, trancado: false, resolvido: true, tags: [], enquete: false, editado: false }
  it('cada tipo continua pela sua própria lista, com o termo como alvo', async () => {
    maisAcao.mockResolvedValueOnce({ itens: [], proximo: undefined })
    render(<ListaBusca tipo="topicos" inicial={{ itens: [topico], proximo: '10' }} termo="backup" d={d} lang="pt" agora={AGORA} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(maisAcao).toHaveBeenCalledWith({ lista: 'buscaTopicos', de: 'backup', opcoes: undefined, cursor: '10' })
  })
  it('o tópico mostra onde mora e que foi resolvido', () => {
    render(<CartaoTopicoMini t={topico} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('link', { name: 'Cinema de Sofá' })).toHaveAttribute('href', `/pt/comunidades/${topico.comunidade}`)
    expect(screen.getByText('Resolvido')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nome de backup' })).toHaveAttribute('href', `/pt/t/${topico.id}`)
  })
})

describe('Destaque', () => {
  it('marca só o que casa', () => {
    const { container } = render(<p><Destaque texto="Cinema de Sofá" termo="sof" /></p>)
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Sof'])
    expect(container.textContent).toBe('Cinema de Sofá')
  })
})

describe('ItemRegistro', () => {
  const x: RegistroModeracao = { id: 'r1', em: '2026-11-04T10:00:00.000Z', escopo: 'rele', contexto: null, acao: 'remocao', alvoTipo: 'topico', alvo: 'ob_DEMOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', motivo: 'dados-pessoais', por: 'rele', apelacao: 'aberta' }
  it('mostra o que foi feito, o motivo, o papel e a apelação, e nunca um texto removido', () => {
    render(<ol><ItemRegistro x={x} d={d} lang="pt" agora={AGORA} /></ol>)
    expect(screen.getByText('Conteúdo removido')).toBeInTheDocument()
    expect(screen.getByText('Dado pessoal de alguém')).toBeInTheDocument()
    expect(screen.getByText(/o relé/)).toBeInTheDocument()
    expect(screen.getByText('Apelação aberta')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('expulsão e banimento mostram o rover, não um id', () => {
    render(<ol><ItemRegistro x={{ ...x, acao: 'banimento', alvoTipo: null, alvo: { ...pipa }, por: 'moderador', apelacao: null }} d={d} lang="pt" agora={AGORA} /></ol>)
    expect(screen.getByText('Rover banido')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pipa/ })).toHaveAttribute('href', '/pt/r/pipa')
  })
})
