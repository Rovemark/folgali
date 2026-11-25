// As telas de mensagens privadas (revisão 0.4.0) montadas de verdade em cima do cliente falso: o que a pessoa vê em cada estado da
// conversa, os portões (sem app, relé sem o recurso) e os avisos que a tela tem de dizer (o que o relé vê, a denúncia revela o texto).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { notFound, estado } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), estado: { rede: null as unknown } }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt/mensagens' }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao: vi.fn(async () => ({ ok: true })), maisAcao: vi.fn(), proporAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.mock('@/lib/obter-rede', () => ({ obterRede: () => estado.rede }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { ClienteFalso } from '@/lib/cliente-falso'
import { uidDe } from '@/lib/demo-dados'
import { CONVERSAS } from '@/lib/social/falso/semente-mensagens'
import { agirAcao } from '@/app/acoes-sociais'
import Navegacao from '@/components/Navegacao'
import { dict } from '@/lib/i18n'
import Mensagens from '@/app/[lang]/mensagens/page'
import ConversaAberta from '@/app/[lang]/mensagens/[id]/page'

const AGORA = () => new Date('2026-11-05T15:00:00.000Z')
const tela = async (jsx: Promise<React.ReactElement>) => render(await jsx)
const lista = (sp: { estado?: string; para?: string } = {}, lang = 'pt') => tela(Mensagens({ params: Promise.resolve({ lang }), searchParams: Promise.resolve(sp) }))
const conversa = (id: string, lang = 'pt') => tela(ConversaAberta({ params: Promise.resolve({ lang, id }) }))

beforeEach(() => {
  notFound.mockClear()
  vi.mocked(agirAcao).mockClear()
  const falso = new ClienteFalso(AGORA)
  estado.rede = { cliente: falso, ponte: falso }
})

describe('lista de conversas', () => {
  it('mostra as cinco conversas, a faixa de demonstração e o que o relé vê', async () => {
    await lista()
    expect(screen.getByRole('heading', { level: 1, name: 'Mensagens' })).toBeInTheDocument()
    expect(screen.getByText(/as conversas abaixo são inventadas/)).toBeInTheDocument()
    expect(screen.getByText(/quem conversa com quem, quando/)).toBeInTheDocument()
    const itens = screen.getAllByRole('link', { name: /@(pipa|nina|max|tuca|teco)/ }).filter((a) => a.getAttribute('href')?.startsWith('/pt/mensagens/'))
    expect(itens).toHaveLength(5)
    expect(screen.getByText(/· Pediu para conversar/)).toBeInTheDocument()
    expect(screen.getByText(/· Você pediu para conversar/)).toBeInTheDocument()
    expect(screen.getByText('Encerrada')).toBeInTheDocument()
  })
  it('o pedido recebido tem Aceitar e Recusar ali mesmo, e o Aceitar pede confirmação dizendo o que acontece depois', async () => {
    await lista()
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByText(/as mensagens vão cifradas entre os dois rovers/)).toBeInTheDocument()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Aceitar' }))
    await vi.waitFor(() => expect(agirAcao).toHaveBeenCalledWith({ tipo: 'conversa-decidir', conversa: CONVERSAS.nina, decisao: 'aceitar' }))
  })
  it('o filtro Pedidos mostra só as pendentes, e o link ativo é marcado', async () => {
    await lista({ estado: 'pendentes' })
    expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('aria-current', 'page')
    const itens = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/pt/mensagens/ob_'))
    expect(itens).toHaveLength(2)
  })
  it('pedir conversa: amigo com conversa aberta ou pendente aparece como "Já conversam"; o livre ganha o formulário de pedido', async () => {
    const { unmount } = await lista()
    expect(screen.getAllByText('Já conversam')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Pedir conversa' })).toHaveAttribute('href', `/pt/mensagens?para=${uidDe('tuca')}#pedir`)
    unmount()
    await lista({ para: uidDe('tuca') })
    expect(screen.getByText('pedido de conversa a @tuca')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar o pedido' })).toBeDisabled() // vazio não sai
  })
  it('para= de quem já conversa, ou de quem não é amigo, não abre formulário', async () => {
    await lista({ para: uidDe('pipa') })
    expect(screen.queryByRole('button', { name: 'Enviar o pedido' })).toBeNull()
  })
})

describe('conversa aberta', () => {
  it('aceita: pedido em claro, as mensagens, denúncia só nas recebidas e o formulário de escrever', async () => {
    await conversa(CONVERSAS.pipa)
    expect(screen.getByRole('heading', { level: 1, name: 'Conversa com Pipa' })).toBeInTheDocument()
    expect(screen.getByText(/posso te mandar a foto da nuvem/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('msg'))).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Denunciar' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Apagar a minha cópia' })).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Entregar ao rover' })).toBeInTheDocument()
    expect(screen.getByText(/O seu rover envia na próxima folga/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encerrar a conversa' })).toBeInTheDocument()
  })
  it('denunciar avisa que o texto e a assinatura vão para quem opera o relé, e manda o ato certo', async () => {
    await conversa(CONVERSAS.pipa)
    fireEvent.click(screen.getAllByRole('button', { name: 'Denunciar' })[0])
    expect(screen.getByText(/revela a quem opera o relé o texto desta mensagem e a assinatura/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revelar e denunciar' }))
    expect(screen.getByText('Escolha um motivo.')).toBeInTheDocument()
    expect(agirAcao).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('radio')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Revelar e denunciar' }))
    await vi.waitFor(() => expect(agirAcao).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'mensagem-denuncia', motivo: 'spam' })))
    expect(await screen.findByText(/Denúncia enviada/)).toBeInTheDocument()
  })
  it('a mensagem ilegível não mostra texto nenhum e não tem denúncia', async () => {
    await conversa(CONVERSAS.teco)
    const ilegivel = screen.getByText(/Mensagem ilegível/)
    const item = ilegivel.closest('li')!
    expect(item).toHaveAttribute('data-ilegivel', 'true')
    expect(within(item).queryByRole('button', { name: 'Denunciar' })).toBeNull()
  })
  it('pedido recebido: decide, sem formulário de escrever', async () => {
    await conversa(CONVERSAS.nina)
    expect(screen.getByText('Este pedido espera a sua decisão.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entregar ao rover' })).toBeNull()
    expect(screen.getByText(/fica em claro no relé até a conversa ser aceita/)).toBeInTheDocument()
  })
  it('pedido enviado: espera e pode cancelar', async () => {
    await conversa(CONVERSAS.max)
    expect(screen.getByText('Esperando @max decidir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar o pedido' })).toBeInTheDocument()
  })
  it('encerrada: o histórico fica, ninguém escreve', async () => {
    await conversa(CONVERSAS.tuca)
    expect(screen.getByText(/Esta conversa foi encerrada/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entregar ao rover' })).toBeNull()
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('msg'))).toHaveLength(2)
  })
  it('id mal formado é "não encontrado"; conversa de outros não existe para quem lê', async () => {
    await expect(conversa('lixo')).rejects.toThrow('NOT_FOUND')
    await expect(conversa('ob_DEMOnaoexiste000000000000000000000000000')).rejects.toThrow('NOT_FOUND')
  })
  it('em árabe, a tela monta com o @ em direção própria', async () => {
    await conversa(CONVERSAS.pipa, 'ar')
    expect(document.querySelector('bdi[dir="ltr"]')?.textContent).toBe('@pipa')
  })
})

describe('portões: a tela é do app da pessoa', () => {
  it('sem o app pareado, nada de conversa (nem lista nem conversa aberta)', async () => {
    const falso = new ClienteFalso(AGORA)
    estado.rede = { cliente: falso, ponte: { ...falso, quemSou: async () => null } }
    const { unmount } = await lista()
    expect(screen.getByText(/Pareie o app do Rover Hangar/)).toBeInTheDocument()
    expect(screen.queryByText(/Pediu para conversar/)).toBeNull()
    unmount()
    await conversa(CONVERSAS.pipa)
    expect(screen.getByText(/Pareie o app do Rover Hangar/)).toBeInTheDocument()
    expect(screen.queryByText(/posso te mandar a foto/)).toBeNull()
  })
  it('relé sem o recurso `mensagens`: explica e não chama as rotas', async () => {
    const falso = new ClienteFalso(AGORA)
    const conversas = vi.spyOn(falso, 'conversas')
    const cliente = new Proxy(falso, { get: (alvo, p) => (p === 'suporta' ? async () => false : Reflect.get(alvo, p)) })
    estado.rede = { cliente, ponte: falso }
    await lista()
    expect(screen.getByText(/não tem as mensagens privadas ligadas/)).toBeInTheDocument()
    expect(conversas).not.toHaveBeenCalled()
  })
})

describe('menu', () => {
  const f = dict('pt').socFolgali
  const eu = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff', acessorios: [] } }
  it('Mensagens aparece no trilho só quando a casca diz que há mensagens (app pareado e relé com o recurso)', () => {
    const { unmount } = render(<Navegacao lang="pt" topo={f.topo} trilho={f.trilho} eu={eu} mensagens={false} modo="trilho" />)
    expect(screen.queryByRole('link', { name: 'Mensagens' })).toBeNull()
    unmount()
    render(<Navegacao lang="pt" topo={f.topo} trilho={f.trilho} eu={eu} mensagens modo="trilho" />)
    expect(screen.getByRole('link', { name: 'Mensagens' })).toHaveAttribute('href', '/pt/mensagens')
    expect(screen.getByRole('link', { name: 'Mensagens' })).toHaveAttribute('aria-current', 'page')
  })
})
