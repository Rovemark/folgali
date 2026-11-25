import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agirAcao } = vi.hoisted(() => ({ agirAcao: vi.fn(async (a: unknown) => (void a, { ok: true as const, resultado: undefined as string | undefined })) }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao, maisAcao: vi.fn(), proporAcao: vi.fn() }))
vi.mock('@/app/acoes', () => ({ reagirAcao: vi.fn(async () => ({ ok: true })), apagarAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))

import EnqueteBloco from '@/components/comunidades/EnqueteBloco'
import Fio, { type ContextoDoFio } from '@/components/comunidades/Fio'
import GestaoTopico from '@/components/comunidades/GestaoTopico'
import { dict } from '@/lib/i18n'
import type { Enquete, RespostaForum } from '@/lib/social/tipos'

const d = dict('pt')
const AGORA = '2026-11-05T12:00:00.000Z'
const TOP = 'ob_DEMOtcinemapipoca00000000000000000000000000'
const rosto = { corpo: 'sino', cor: '#b49cff' }
const rover = (n: string) => ({ uid: `rvr_DEMO${n}`.padEnd(26, '0'), handle: n, nome: n[0].toUpperCase() + n.slice(1), rosto })
const resp = (id: string, autor: string, texto: string, extra: Partial<RespostaForum> = {}): RespostaForum => ({
  id: `ob_DEMO${id}`.padEnd(46, '0'), autor: rover(autor), texto, criadoEm: '2026-11-05T10:00:00.000Z', em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 }, minhaReacao: null, ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const ctx = (extra: Partial<ContextoDoFio> = {}): ContextoDoFio => ({
  topico: TOP, resolvidaId: null, autorDoTopico: rover('lumi').uid, meuUid: rover('lumi').uid, nomeDoRover: 'Lumi', podeEscrever: true,
  responder: true, resolver: true, equipe: true, euModerador: false, donoUid: rover('lumi').uid, ...extra,
})

describe('Fio: resposta em fio de um nível, com citação', () => {
  const mae = resp('mae', 'pipa', 'Eu nomeio por data e por projeto.', { filhas: 2 })
  const f1 = resp('f1', 'nina', 'Funciona até o projeto mudar de nome.', { em: mae.id })
  const f2 = resp('f2', 'max', 'Por isso uso a data primeiro.', { em: mae.id, cita: { id: f1.id, autor: rover('nina'), trecho: 'Funciona até o projeto mudar de nome.' } })

  it('mostra as filhas dentro de um "ver N respostas" e a citação em bloco', () => {
    render(<Fio respostas={[mae]} filhas={{ [mae.id]: [f1, f2] }} c={ctx()} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByText('Ver 2 respostas')).toBeInTheDocument()
    const bloco = screen.getByText('Citando Nina').closest('blockquote')!
    expect(within(bloco).getByText('Funciona até o projeto mudar de nome.')).toBeInTheDocument()
  })
  it('citação de resposta removida mostra o aviso em vez do trecho', () => {
    const g = resp('g', 'max', 'Concordo.', { em: mae.id, cita: { id: 'ob_DEMOsumiu', autor: rover('nina'), trecho: null } })
    render(<Fio respostas={[mae]} filhas={{ [mae.id]: [f1, g] }} c={ctx()} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByText('A resposta citada foi removida.')).toBeInTheDocument()
  })
  it('a resposta que resolveu ganha a marca, e abre as filhas para ela aparecer', () => {
    const { container } = render(<Fio respostas={[mae]} filhas={{ [mae.id]: [f1, f2, resp('f3', 'seixo', 'Resolvido assim.', { em: mae.id })] }} c={ctx({ resolvidaId: f2.id })} d={d} lang="pt" agora={AGORA} />)
    expect(container.querySelector('.resposta.resolveu')).not.toBeNull()
    expect(container.querySelector('details.filhas')).toHaveAttribute('open')
  })
  it('nas respostas dos outros: denunciar e remover (equipe); na minha: apagar, sem denunciar', () => {
    render(<Fio respostas={[resp('a', 'pipa', 'De outro.', { })]} filhas={{}} c={ctx()} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('button', { name: /Denunciar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
  })
  it('a minha resposta: sem denunciar e sem remover pela moderação, com "Apagar a minha"', () => {
    render(<Fio respostas={[resp('m', 'lumi', 'Minha.')]} filhas={{}} c={ctx()} d={d} lang="pt" agora={AGORA} />)
    expect(screen.queryByRole('button', { name: /Denunciar/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Apagar a minha/ })).toBeInTheDocument()
  })
  it('moderador não remove a resposta do dono (a UI nem oferece)', () => {
    render(<Fio respostas={[resp('d', 'lumi', 'Do dono.')]} filhas={{}} c={ctx({ meuUid: rover('nina').uid, euModerador: true })} d={d} lang="pt" agora={AGORA} />)
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull()
  })
  it('tópico trancado: sem "Responder" e com a razão', () => {
    render(<Fio respostas={[resp('a', 'pipa', 'Texto.')]} filhas={{}} c={ctx({ responder: false, responderMotivo: 'Tópico trancado: só a moderação responde.' })} d={d} lang="pt" agora={AGORA} />)
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    expect(screen.getByText('Tópico trancado: só a moderação responde.')).toBeInTheDocument()
  })
  it('marcar como a que resolveu envia o gesto com a resposta; marcada, o botão desfaz (resposta nula)', async () => {
    const r = resp('a', 'pipa', 'Texto.')
    const { unmount } = render(<Fio respostas={[r]} filhas={{}} c={ctx()} d={d} lang="pt" agora={AGORA} />)
    await userEvent.click(screen.getByRole('button', { name: /Marcar como a que resolveu/ }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'topico-resolvido', topico: TOP, resposta: r.id })
    unmount()
    render(<Fio respostas={[r]} filhas={{}} c={ctx({ resolvidaId: r.id })} d={d} lang="pt" agora={AGORA} />)
    await userEvent.click(screen.getByRole('button', { name: /Tirar a marca/ }))
    expect(agirAcao).toHaveBeenLastCalledWith({ tipo: 'topico-resolvido', topico: TOP, resposta: null })
  })
  it('o formulário de responder a uma filha explica que a resposta vai para a de cima e cita', async () => {
    render(<Fio respostas={[mae]} filhas={{ [mae.id]: [f1, f2] }} c={ctx()} d={d} lang="pt" agora={AGORA} />)
    const art = screen.getByText('Funciona até o projeto mudar de nome.', { selector: 'p' }).closest('article')!
    await userEvent.click(within(art).getByRole('button', { name: 'Responder' }))
    expect(screen.getByText(/resposta de segundo nível/)).toBeInTheDocument()
  })
})

describe('EnqueteBloco: voto secreto, sem troca', () => {
  const enquete = (extra: Partial<Enquete> = {}): Enquete => ({ opcoes: [{ texto: 'Desktop', votos: 3 }, { texto: 'Downloads', votos: 1 }], encerraEm: '2026-11-08T12:00:00.000Z', encerrada: false, total: 4, voce: null, ...extra })

  it('aberta e sem voto: um botão por opção; depois de votar eles somem e o voto vira o seu', async () => {
    render(<EnqueteBloco topico={TOP} e={enquete()} podeVotar d={d} agora={AGORA} />)
    expect(screen.getAllByRole('button', { name: /Votar nesta opção/ })).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: /Votar nesta opção.*Downloads/ }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'voto', topico: TOP, opcao: 1 })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Votar/ })).toBeNull())
    expect(screen.getByText(/Seu voto/)).toBeInTheDocument()
    expect(screen.getByText(/5 votos/, { selector: 'p' })).toBeInTheDocument()
  })
  it('quem já votou não vê botão de voto (não troca)', () => {
    render(<EnqueteBloco topico={TOP} e={enquete({ voce: 0 })} podeVotar d={d} agora={AGORA} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('encerrada: só o resultado, com percentuais', () => {
    render(<EnqueteBloco topico={TOP} e={enquete({ encerrada: true })} podeVotar d={d} agora={AGORA} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/75%/)).toBeInTheDocument()
    expect(screen.getByText(/25%/)).toBeInTheDocument()
  })
  it('quem não pode votar (de fora, banido, recém-chegado) vê o resultado e o porquê, sem botão', () => {
    render(<EnqueteBloco topico={TOP} e={enquete()} podeVotar={false} d={d} agora={AGORA} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/Só membros votam/)).toBeInTheDocument()
  })
})

describe('GestaoTopico: fixar, trancar, mover, remover', () => {
  const base = { topico: TOP, fixado: false, trancado: false, d }
  const origem = { id: 'ob_origem', acesso: 'aberta' as const, papel: 'moderador' as const }

  it('fixar e trancar enviam o gesto certo; quando já estão, o botão desfaz', async () => {
    const { unmount } = render(<GestaoTopico {...base} origem={origem} destinos={[]} podeRemover />)
    await userEvent.click(screen.getByRole('button', { name: /Fixar no alto/ }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'topico-gestao', topico: TOP, acao: 'fixar', comunidade: null, categoria: null })
    await userEvent.click(screen.getByRole('button', { name: /Trancar/ }))
    expect(agirAcao).toHaveBeenLastCalledWith({ tipo: 'topico-gestao', topico: TOP, acao: 'trancar', comunidade: null, categoria: null })
    unmount()
    render(<GestaoTopico {...base} fixado trancado origem={origem} destinos={[]} podeRemover />)
    expect(screen.getByRole('button', { name: /Desafixar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Destrancar/ })).toBeInTheDocument()
  })
  it('mover só oferece comunidades em que a pessoa também é equipe, e nunca a própria origem', async () => {
    const destinos = [
      { id: 'ob_origem', nome: 'Origem', acesso: 'aberta' as const, papel: 'moderador' as const, categorias: [] },
      { id: 'ob_outra', nome: 'Outra', acesso: 'aberta' as const, papel: 'dono' as const, categorias: ['Dicas'] },
    ]
    render(<GestaoTopico {...base} origem={origem} destinos={destinos} podeRemover />)
    await userEvent.click(screen.getByRole('button', { name: /Mover para outra comunidade/ }))
    const s = screen.getByLabelText('Comunidade de destino')
    expect(within(s).getAllByRole('option').map((o) => o.textContent)).toEqual(['Outra'])
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(agirAcao).toHaveBeenCalledWith({ tipo: 'topico-gestao', topico: TOP, acao: 'mover', comunidade: 'ob_outra', categoria: null }))
  })
  it('de fechada para aberta, só o dono da origem pode: moderador nem vê a opção', () => {
    const destinos = [{ id: 'ob_pub', nome: 'Pública', acesso: 'aberta' as const, papel: 'dono' as const, categorias: [] }]
    render(<GestaoTopico {...base} origem={{ id: 'ob_fechada', acesso: 'fechada', papel: 'moderador' }} destinos={destinos} podeRemover />)
    expect(screen.getByRole('button', { name: /Mover para outra comunidade/ })).toBeDisabled()
    expect(screen.getByText(/não modera outra comunidade/)).toBeInTheDocument()
  })
  it('o dono move de fechada para aberta, com o aviso de que fica público', async () => {
    const destinos = [{ id: 'ob_pub', nome: 'Pública', acesso: 'aberta' as const, papel: 'dono' as const, categorias: [] }]
    render(<GestaoTopico {...base} origem={{ id: 'ob_fechada', acesso: 'fechada', papel: 'dono' }} destinos={destinos} podeRemover />)
    await userEvent.click(screen.getByRole('button', { name: /Mover para outra comunidade/ }))
    expect(screen.getByText(/fica público no destino/)).toBeInTheDocument()
  })
  it('sem permissão para remover (conteúdo do dono visto por moderador), o botão de remover não existe', () => {
    render(<GestaoTopico {...base} origem={origem} destinos={[]} podeRemover={false} />)
    expect(screen.queryByRole('button', { name: /Remover o tópico/ })).toBeNull()
  })
})
