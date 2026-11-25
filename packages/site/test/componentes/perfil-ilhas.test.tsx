import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agirAcao, maisAcao, marcarAvisosVistosAcao, seguirAcao } = vi.hoisted(() => ({
  agirAcao: vi.fn(async () => ({ ok: true as const })) as ReturnType<typeof vi.fn>,
  maisAcao: vi.fn(async () => null),
  marcarAvisosVistosAcao: vi.fn(async () => undefined),
  seguirAcao: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao, maisAcao, marcarAvisosVistosAcao }))
vi.mock('@/app/acoes', () => ({ seguirAcao }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))

import AcoesRelacao from '@/components/perfil/AcoesRelacao'
import ListaAvisos, { fraseDoAviso } from '@/components/perfil/ListaAvisos'
import ListaDepoimentos from '@/components/perfil/ListaDepoimentos'
import ListaRecados from '@/components/perfil/ListaRecados'
import Medalhas from '@/components/perfil/Medalhas'
import { dict } from '@/lib/i18n'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import type { Depoimento, Notificacao, Recado } from '@/lib/social/tipos'
import { AGORA, pipa, lumi } from './ajuda'

const d = dict('pt')
const uid = (s: string) => idDeDemonstracao('rvr', s)
const ob = (s: string) => idDeDemonstracao('ob', s)

beforeEach(() => {
  vi.clearAllMocks()
  agirAcao.mockImplementation(async () => ({ ok: true }))
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

describe('Medalhas', () => {
  const selos = { confiavel: 3, caprichoso: 0, rapido: 1, divertido: 2 }
  it('mostra a contagem de amigos de cada selo e, para quem pode, o botão de dar', async () => {
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sim" d={d} />)
    expect(screen.getByText('3 amigos')).toBeInTheDocument()
    expect(screen.getByText('1 amigo')).toBeInTheDocument()
    expect(screen.getByText('ninguém ainda')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Dar o selo Rápido/ }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'selo', alvo: pipa.uid, selo: 'rapido' })
  })
  it('sem permissão não há botão nenhum e a razão aparece', () => {
    const { rerender } = render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="nao-amigo" d={d} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(/Selo é entre amigos/)).toBeInTheDocument()
    rerender(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sem-tempo" d={d} />)
    expect(screen.getByText(/7 dias ou mais/)).toBeInTheDocument()
    rerender(<Medalhas selos={selos} alvoUid={pipa.uid} pode="ninguem" d={d} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('quando o relé recusa, o motivo aparece ali mesmo', async () => {
    agirAcao.mockImplementationOnce(async () => ({ ok: false, codigo: 'ja-existe' }))
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sim" d={d} />)
    await userEvent.click(screen.getByRole('button', { name: /Dar o selo Confiável/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Isso já existe.')
  })
})

const dep = (extra: Partial<Depoimento> = {}): Depoimento => ({ id: ob('dep1'), autor: pipa, alvo: lumi.uid, texto: 'Trabalhar com a Lumi é fácil.', estado: 'aceito', criadoEm: '2026-11-01T10:00:00.000Z', aceitoEm: '2026-11-02T10:00:00.000Z', ...extra })

describe('ListaDepoimentos', () => {
  const base = { donoUid: lumi.uid, donoHandle: 'lumi', d, lang: 'pt' as const, agora: AGORA }
  it('o dono vê os pendentes e decide: aceitar vai direto, recusar pede confirmação', async () => {
    const pend = dep({ id: ob('pend1'), estado: 'pendente', texto: 'Texto esperando.' })
    render(<ListaDepoimentos {...base} aceitos={{ itens: [dep()] }} pendentes={[pend]} meuUid={lumi.uid} />)
    expect(screen.getByText('Esperando a sua decisão')).toBeInTheDocument()
    expect(screen.getByText('Texto esperando.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'depoimento-decisao', depoimento: pend.id, decisao: 'aceitar' })
    agirAcao.mockClear()
    const botoesRecusar = screen.getAllByRole('button', { name: 'Recusar' })
    await userEvent.click(botoesRecusar[0])
    expect(agirAcao).not.toHaveBeenCalled()
    const dialogo = screen.getByRole('dialog', { hidden: true })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Recusar', hidden: true }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'depoimento-decisao', depoimento: pend.id, decisao: 'recusar' })
  })
  it('quem não é o dono nunca vê pendente, mesmo que ele chegue por engano', () => {
    const pend = dep({ id: ob('pend2'), estado: 'pendente', texto: 'Segredo do dono.' })
    render(<ListaDepoimentos {...base} aceitos={{ itens: [dep()] }} pendentes={[pend]} meuUid={pipa.uid} />)
    expect(screen.queryByText('Segredo do dono.')).not.toBeInTheDocument()
    expect(screen.queryByText('Esperando a sua decisão')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument()
    expect(screen.getByText('Trabalhar com a Lumi é fácil.')).toBeInTheDocument()
  })
  it('o dono pode esconder um depoimento já aceito (com confirmação)', async () => {
    render(<ListaDepoimentos {...base} aceitos={{ itens: [dep()] }} pendentes={[]} meuUid={lumi.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Esconder do meu perfil' }))
    expect(agirAcao).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Esconder', hidden: true }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'depoimento-decisao', depoimento: dep().id, decisao: 'recusar' })
  })
})

const recado = (extra: Partial<Recado> = {}): Recado => ({ id: ob('rec1'), autor: pipa, alvo: lumi.uid, texto: 'Oi, @lumi! Passei para deixar um oi. #pastas', criadoEm: '2026-11-04T14:00:00.000Z', ...extra })

describe('ListaRecados', () => {
  const base = { inicial: { itens: [recado()] }, donoUid: lumi.uid, donoHandle: 'lumi', d, lang: 'pt' as const, agora: AGORA }
  it('desenha menção e tag como links e mostra o bilhete', () => {
    render(<ListaRecados {...base} meuUid={null} />)
    expect(screen.getByRole('link', { name: '@lumi' })).toHaveAttribute('href', '/pt/r/lumi')
    expect(screen.getByRole('link', { name: '#pastas' })).toHaveAttribute('href', expect.stringContaining('buscar?q='))
  })
  it('o menu de um estranho só tem denunciar', () => {
    render(<ListaRecados {...base} meuUid={uid('lola')} />)
    expect(screen.getByRole('link', { name: 'Denunciar' })).toHaveAttribute('href', expect.stringContaining('/pt/denunciar/'))
    expect(screen.queryByRole('button', { name: 'Apagar o recado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tirar do meu mural' })).not.toBeInTheDocument()
  })
  it('o autor apaga o seu; o dono do mural tira com motivo', async () => {
    const { unmount } = render(<ListaRecados {...base} meuUid={pipa.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar o recado' }))
    await userEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Apagar', hidden: true }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'remocao-pelo-autor', alvo: recado().id })
    unmount()
    agirAcao.mockClear()
    render(<ListaRecados {...base} meuUid={lumi.uid} />)
    expect(screen.queryByRole('button', { name: 'Apagar o recado' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar do meu mural' }))
    const dialogo = screen.getByRole('dialog', { hidden: true })
    await userEvent.selectOptions(within(dialogo).getByLabelText('Motivo'), 'spam')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Tirar do mural', hidden: true }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'remocao-por-responsavel', alvo: recado().id, motivo: 'spam' })
  })
})

describe('AcoesRelacao', () => {
  const voce = { amigo: false, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null }
  const props = { uid: pipa.uid, nome: 'Pipa', d }
  it('sem relação: seguir e pedir amizade', async () => {
    render(<AcoesRelacao {...props} euSigo={false} voce={voce} />)
    expect(screen.getByRole('button', { name: 'Seguir' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pedir amizade' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'amizade', alvo: pipa.uid, acao: 'pedir' })
  })
  it('pedido recebido: aceitar e recusar; pedido enviado: cancelar', async () => {
    const { unmount } = render(<AcoesRelacao {...props} voce={{ ...voce, pedidoRecebido: true }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar amizade' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'amizade', alvo: pipa.uid, acao: 'aceitar' })
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument()
    unmount()
    render(<AcoesRelacao {...props} voce={{ ...voce, pedidoEnviado: true }} />)
    expect(screen.getByText('Pedido enviado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pedir amizade' })).not.toBeInTheDocument()
  })
  it('bloquear e silenciar ficam atrás de "Mais opções" e pedem confirmação; o outro lado não é avisado', async () => {
    render(<AcoesRelacao {...props} voce={{ ...voce, amigo: true }} />)
    expect(screen.queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(agirAcao).not.toHaveBeenCalled()
    const dialogo = screen.getByRole('dialog', { hidden: true })
    expect(dialogo).toHaveTextContent('não recebe aviso nenhum')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Bloquear', hidden: true }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'relacao', alvo: pipa.uid, acao: 'bloquear' })
  })
  it('quando eu bloqueei, só aparece o aviso e o desbloquear', async () => {
    render(<AcoesRelacao {...props} euSigo={false} voce={{ ...voce, euBloqueei: true }} />)
    expect(screen.getByText('Você bloqueou Pipa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seguir' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'relacao', alvo: pipa.uid, acao: 'desbloquear' })
  })
})

const aviso = (extra: Partial<Notificacao>): Notificacao => ({ seq: 5, tipo: 'recado', em: '2026-11-04T14:50:00.000Z', origem: pipa, objeto: ob('x'), comunidade: null, pagina: null, ...extra })

describe('avisos', () => {
  it('a frase nunca traz conteúdo: só quem e onde, e trata nome ausente', () => {
    expect(fraseDoAviso(aviso({}), d)).toBe('Pipa deixou um recado no seu mural')
    expect(fraseDoAviso(aviso({ tipo: 'resposta-no-topico', nomeDoTopico: 'Nomes de backup' }), d)).toBe('Pipa respondeu ao seu tópico Nomes de backup')
    expect(fraseDoAviso(aviso({ tipo: 'selo-recebido', origem: null }), d)).toBe('Um amigo deu um selo ao seu rover')
    expect(fraseDoAviso(aviso({ tipo: 'recado', origem: null }), d)).toBe('Alguém deixou um recado no seu mural')
  })
  it('os novos ficam em destaque, os pedidos têm botão ali mesmo, e abrir marca como visto', async () => {
    const itens = [aviso({ seq: 9, tipo: 'pedido-de-amizade', objeto: null }), aviso({ seq: 3, tipo: 'recado' })]
    render(<ListaAvisos inicial={{ itens }} meuUid={lumi.uid} meuHandle="lumi" visto={5} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('heading', { name: /Novos/ })).toBeInTheDocument()
    await waitFor(() => expect(marcarAvisosVistosAcao).toHaveBeenCalledWith(9))
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'amizade', alvo: pipa.uid, acao: 'aceitar' })
    expect(screen.getAllByRole('link', { name: 'Abrir' }).map((a) => a.getAttribute('href'))).toEqual(['/pt/amigos', '/pt/r/lumi?aba=mural'])
  })
  it('0.4.0: pedido e aceite de conversa dizem só quem, levam a /mensagens e não têm botão de decidir ali', () => {
    expect(fraseDoAviso(aviso({ tipo: 'conversa-pedido', objeto: null }), d)).toBe('Pipa pediu para conversar com você por mensagem privada')
    expect(fraseDoAviso(aviso({ tipo: 'conversa-aceita', objeto: null }), d)).toBe('Pipa aceitou conversar com você por mensagem privada')
    expect(fraseDoAviso(aviso({ tipo: 'conversa-pedido', objeto: null }), dict('en'))).toBe('Pipa asked to talk with you by private message')
    expect(fraseDoAviso(aviso({ tipo: 'conversa-aceita', origem: null, objeto: null }), d)).toBe('Alguém aceitou conversar com você por mensagem privada')
    const itens = [aviso({ seq: 8, tipo: 'conversa-pedido', objeto: null }), aviso({ seq: 7, tipo: 'conversa-aceita', objeto: null, origem: null })]
    const { container } = render(<ListaAvisos inicial={{ itens }} meuUid={lumi.uid} meuHandle="lumi" visto={9} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getAllByRole('link', { name: 'Abrir' }).map((a) => a.getAttribute('href'))).toEqual(['/pt/mensagens', '/pt/mensagens'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // com origem, o retrato de quem pediu; sem origem, o ícone do cadeado (nunca o ícone genérico de alerta)
    expect(container.querySelectorAll('[data-tipo="conversa-aceita"] .pf-aviso-icone svg')).toHaveLength(1)
    expect(container.querySelector('[data-tipo="conversa-pedido"]')?.textContent).toContain('Pipa pediu para conversar')
  })
  it('quando o objeto sumiu, diz que não está mais disponível e não oferece link', () => {
    render(<ListaAvisos inicial={{ itens: [aviso({ seq: 2, tipo: 'resposta-no-topico', objeto: null })] }} meuUid={lumi.uid} meuHandle="lumi" visto={9} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByText(/não está mais disponível/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Abrir' })).not.toBeInTheDocument()
    expect(marcarAvisosVistosAcao).not.toHaveBeenCalled()
  })
})
