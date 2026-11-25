import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agirAcao } = vi.hoisted(() => ({ agirAcao: vi.fn(async (a: unknown) => (void a, { ok: true as const, resultado: undefined as string | undefined })) }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao, maisAcao: vi.fn(), proporAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))

import AcaoComMotivo from '@/components/comunidades/AcaoComMotivo'
import MembrosModeracao from '@/components/comunidades/MembrosModeracao'
import { dict } from '@/lib/i18n'
import type { MembroItem } from '@/lib/social/tipos'

const d = dict('pt')
const ID = 'ob_DEMOcvitrola0000000000000000000000000000000'
const rosto = { corpo: 'sino', cor: '#b49cff' }
const rover = (n: string) => ({ uid: `rvr_DEMO${n}`.padEnd(26, '0'), handle: n, nome: n[0].toUpperCase() + n.slice(1), rosto })
const m = (n: string, papel: MembroItem['papel']): MembroItem => ({ rover: rover(n), papel, desde: '2026-10-01T10:00:00.000Z' })
const LISTA = { itens: [m('lumi', 'dono'), m('nina', 'moderador'), m('pipa', 'membro'), m('max', 'membro')] }

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const linha = (nome: string) => screen.getByText(nome, { selector: 'strong' }).closest('li')!

function renderiza(meuPapel: 'dono' | 'moderador', meuUid: string, acesso: 'aberta' | 'fechada' = 'aberta') {
  return render(<MembrosModeracao inicial={LISTA} comunidade={ID} acesso={acesso} meuPapel={meuPapel} meuUid={meuUid} d={d} lang="pt" agora="2026-11-05T12:00:00.000Z" />)
}

describe('MembrosModeracao: a matriz de papéis decide o que aparece', () => {
  it('o dono promove e expulsa e bane membros; rebaixa moderador; nunca age sobre si', () => {
    renderiza('dono', rover('lumi').uid)
    const pipa = within(linha('Pipa'))
    expect(pipa.getByRole('button', { name: 'Promover a moderador' })).toBeInTheDocument()
    expect(pipa.getByRole('button', { name: 'Expulsar' })).toBeInTheDocument()
    expect(pipa.getByRole('button', { name: 'Banir' })).toBeInTheDocument()
    const nina = within(linha('Nina'))
    expect(nina.getByRole('button', { name: 'Rebaixar a membro' })).toBeInTheDocument()
    expect(nina.getByRole('button', { name: 'Banir' })).toBeInTheDocument()
    expect(within(linha('Lumi')).queryByRole('button')).toBeNull()
  })
  it('o moderador só expulsa e bane membros comuns: nada sobre moderador nem sobre o dono', () => {
    renderiza('moderador', rover('nina').uid)
    expect(within(linha('Pipa')).getByRole('button', { name: 'Expulsar' })).toBeInTheDocument()
    expect(within(linha('Pipa')).getByRole('button', { name: 'Banir' })).toBeInTheDocument()
    expect(within(linha('Pipa')).queryByRole('button', { name: /Promover/ })).toBeNull()
    expect(within(linha('Lumi')).queryByRole('button')).toBeNull()
    expect(within(linha('Nina')).queryByRole('button')).toBeNull()
  })
  it('o moderador não tem como promover nem rebaixar ninguém', () => {
    renderiza('moderador', rover('nina').uid)
    expect(screen.queryByRole('button', { name: /Promover|Rebaixar/ })).toBeNull()
  })
  it('promover é um gesto livre, sem motivo (motivo nulo)', async () => {
    renderiza('dono', rover('lumi').uid)
    await userEvent.click(within(linha('Max')).getByRole('button', { name: 'Promover a moderador' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'comunidade-gestao', comunidade: ID, alvo: rover('max').uid, acao: 'promover', motivo: null })
  })
})

describe('AcaoComMotivo: motivo do enum, obrigatório, nunca texto livre', () => {
  const ato = { tipo: 'comunidade-gestao' as const, comunidade: ID, alvo: rover('pipa').uid, acao: 'banir' as const }
  const props = { ato, d, rotulo: 'Banir', titulo: 'Banir este rover?', texto: 'Ele sai e não volta.', confirmar: 'Banir agora' }

  it('o botão de confirmar fica desligado até escolher um motivo', async () => {
    render(<AcaoComMotivo {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    const confirmar = screen.getByRole('button', { name: 'Banir agora' })
    expect(confirmar).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Motivo (obrigatório)'), 'assedio')
    expect(confirmar).toBeEnabled()
  })
  it('oferece exatamente os 7 motivos do protocolo e nenhum campo de texto livre', async () => {
    render(<AcaoComMotivo {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    const s = screen.getByLabelText('Motivo (obrigatório)')
    expect(within(s).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'spam', 'assedio', 'fora-do-tema', 'regras', 'ilegal', 'dados-pessoais', 'outro'])
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('confirma com o ato e o motivo escolhido, e fecha o diálogo', async () => {
    render(<AcaoComMotivo {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    await userEvent.selectOptions(screen.getByLabelText('Motivo (obrigatório)'), 'spam')
    await userEvent.click(screen.getByRole('button', { name: 'Banir agora' }))
    await waitFor(() => expect(agirAcao).toHaveBeenCalledWith({ ...ato, motivo: 'spam' }))
    await waitFor(() => expect(HTMLDialogElement.prototype.close).toHaveBeenCalled())
  })
  it('se o relé recusar, o motivo da recusa aparece no diálogo e ele continua aberto', async () => {
    agirAcao.mockResolvedValueOnce({ ok: false, codigo: 'sem-permissao' } as never)
    render(<AcaoComMotivo {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    await userEvent.selectOptions(screen.getByLabelText('Motivo (obrigatório)'), 'spam')
    await userEvent.click(screen.getByRole('button', { name: 'Banir agora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para isto.')
  })
})
