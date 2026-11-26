import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { actAction } = vi.hoisted(() => ({ actAction: vi.fn(async (a: unknown) => (void a, { ok: true as const, resultado: undefined as string | undefined })) }))
vi.mock('@/app/social-actions', () => ({ actAction, moreAction: vi.fn(), proposeAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import ActionWithReason from '@/components/communities/ActionWithReason'
import MembersModeration from '@/components/communities/ModerationMembers'
import { dict } from '@/lib/i18n'
import type { MemberItem } from '@/lib/social/types'

const d = dict('pt')
const ID = 'ob_DEMOcvitrola0000000000000000000000000000000'
const face = { corpo: 'sino', cor: '#b49cff' }
const rover = (n: string) => ({ uid: `rvr_DEMO${n}`.padEnd(26, '0'), handle: n, nome: n[0].toUpperCase() + n.slice(1), rosto: face })
const m = (n: string, role: MemberItem['papel']): MemberItem => ({ rover: rover(n), papel: role, desde: '2026-10-01T10:00:00.000Z' })
const LIST = { itens: [m('lumi', 'dono'), m('nina', 'moderador'), m('pipa', 'membro'), m('max', 'membro')] }

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const line = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('li')!

function renders(myRole: 'dono' | 'moderador', myUid: string, access: 'aberta' | 'fechada' = 'aberta') {
  return render(<MembersModeration initial={LIST} comunidade={ID} acesso={access} myRole={myRole} myUid={myUid} d={d} lang="pt" agora="2026-11-05T12:00:00.000Z" />)
}

describe('MembersModeration: the role matrix decides what appears', () => {
  it('the owner promotes and expels and bans members; demotes a moderator; never acts on themselves', () => {
    renders('dono', rover('lumi').uid)
    const pipa = within(line('Pipa'))
    expect(pipa.getByRole('button', { name: 'Promover a moderador' })).toBeInTheDocument()
    expect(pipa.getByRole('button', { name: 'Expulsar' })).toBeInTheDocument()
    expect(pipa.getByRole('button', { name: 'Banir' })).toBeInTheDocument()
    const nina = within(line('Nina'))
    expect(nina.getByRole('button', { name: 'Rebaixar a membro' })).toBeInTheDocument()
    expect(nina.getByRole('button', { name: 'Banir' })).toBeInTheDocument()
    expect(within(line('Lumi')).queryByRole('button')).toBeNull()
  })
  it('the moderator only expels and bans regular members: nothing on a moderator or on the owner', () => {
    renders('moderador', rover('nina').uid)
    expect(within(line('Pipa')).getByRole('button', { name: 'Expulsar' })).toBeInTheDocument()
    expect(within(line('Pipa')).getByRole('button', { name: 'Banir' })).toBeInTheDocument()
    expect(within(line('Pipa')).queryByRole('button', { name: /Promover/ })).toBeNull()
    expect(within(line('Lumi')).queryByRole('button')).toBeNull()
    expect(within(line('Nina')).queryByRole('button')).toBeNull()
  })
  it('the moderator has no way to promote or demote anybody', () => {
    renders('moderador', rover('nina').uid)
    expect(screen.queryByRole('button', { name: /Promover|Rebaixar/ })).toBeNull()
  })
  it('promoting is a free gesture, with no reason (null reason)', async () => {
    renders('dono', rover('lumi').uid)
    await userEvent.click(within(line('Max')).getByRole('button', { name: 'Promover a moderador' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'comunidade-gestao', comunidade: ID, alvo: rover('max').uid, acao: 'promover', motivo: null })
  })
})

describe('ActionWithReason: reason from the enum, required, never free text', () => {
  const act = { tipo: 'comunidade-gestao' as const, comunidade: ID, alvo: rover('pipa').uid, acao: 'banir' as const }
  const props = { ato: act, d, rotulo: 'Banir', titulo: 'Banir este rover?', texto: 'Ele sai e não volta.', confirmar: 'Banir agora' }

  it('the confirm button stays disabled until a reason is chosen', async () => {
    render(<ActionWithReason {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    const confirm = screen.getByRole('button', { name: 'Banir agora' })
    expect(confirm).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Motivo (obrigatório)'), 'assedio')
    expect(confirm).toBeEnabled()
  })
  it('offers exactly the 7 protocol reasons and no free-text field', async () => {
    render(<ActionWithReason {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    const s = screen.getByLabelText('Motivo (obrigatório)')
    expect(within(s).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'spam', 'assedio', 'fora-do-tema', 'regras', 'ilegal', 'dados-pessoais', 'outro'])
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('confirms with the act and the chosen reason, and closes the dialog', async () => {
    render(<ActionWithReason {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    await userEvent.selectOptions(screen.getByLabelText('Motivo (obrigatório)'), 'spam')
    await userEvent.click(screen.getByRole('button', { name: 'Banir agora' }))
    await waitFor(() => expect(actAction).toHaveBeenCalledWith({ ...act, motivo: 'spam' }))
    await waitFor(() => expect(HTMLDialogElement.prototype.close).toHaveBeenCalled())
  })
  it('if the relay refuses, the reason for the refusal appears in the dialog and it stays open', async () => {
    actAction.mockResolvedValueOnce({ ok: false, codigo: 'sem-permissao' } as never)
    render(<ActionWithReason {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Banir' }))
    await userEvent.selectOptions(screen.getByLabelText('Motivo (obrigatório)'), 'spam')
    await userEvent.click(screen.getByRole('button', { name: 'Banir agora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para isto.')
  })
})
