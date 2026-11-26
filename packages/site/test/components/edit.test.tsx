// Protocol 0.11.0 part 2 (`edicao`) on the screen, and the person replying (0.7.0): the mark "edited" next to the time and where it
// leads, the public history of versions, "Edit" only on what is the signed-in person's own and only when the relay takes edits, the
// body each type signs, the refusals that say how long is left, and the reply box of a person under a post and in the forum (with
// "join the community and reply"). The pages: a signed-in person gets the reply box, a visitor the invitation to sign in.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  personState: vi.fn(),
  publish: vi.fn(),
  uploadMedia: vi.fn(),
  publishAttachment: vi.fn(),
  prepareFile: vi.fn(),
  refresh: vi.fn(),
  pessoa: null as null | { id: string },
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: h.refresh }), usePathname: () => '/pt' }))
vi.mock('@/app/actions', () => ({ reportAction: vi.fn(), reactAction: vi.fn(), deleteAction: vi.fn(), followAction: vi.fn() }))
vi.mock('@/app/social-actions', () => ({ actAction: vi.fn(), moreAction: vi.fn(), proposeAction: vi.fn(), markNoticesSeenAction: vi.fn(async () => undefined) }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.mock('@/lib/person/device', () => ({ deviceSupported: async () => true }))
vi.mock('@/lib/person/client', async (original) => ({
  ...(await original<typeof import('@/lib/person/client')>()),
  personState: h.personState,
  publish: h.publish,
  uploadMedia: h.uploadMedia,
  publishAttachment: h.publishAttachment,
  ensureAttestation: vi.fn(),
}))
vi.mock('@/lib/person/media', async (original) => ({ ...(await original<typeof import('@/lib/person/media')>()), prepareFile: h.prepareFile }))
// the pages: the real-mode switches (login wired, not a demonstration) and who is signed in
vi.mock('@/lib/site', async (original) => ({ ...(await original<typeof import('@/lib/site')>()), isDemo: () => false }))
vi.mock('@/lib/folgali/issuers', async (original) => ({ ...(await original<typeof import('@/lib/folgali/issuers')>()), issuersReady: () => ({ login: {}, relay: 'http://rele' }) }))
vi.mock('@/lib/folgali/session', async (original) => ({ ...(await original<typeof import('@/lib/folgali/session')>()), currentPerson: async () => h.pessoa }))
vi.mock('@/lib/adult', async (original) => ({ ...(await original<typeof import('@/lib/adult')>()), canSeeAdult: async () => false }))
vi.mock('@/lib/communities/data', async (original) => ({ ...(await original<typeof import('@/lib/communities/data')>()), whoAmI: async () => null }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { FakeClient } from '@/lib/fake-client'
const network = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@/lib/get-network', () => ({ getNetwork: () => ({ cliente: network.cliente, ponte: { whoAmI: async () => null } }) }))

import PostPage from '@/app/[lang]/p/[id]/page'
import TopicPage from '@/app/[lang]/t/[id]/page'
import { Reply, type ThreadContext } from '@/components/communities/Thread'
import { EditButton, Editable, EditableText } from '@/components/edit/Editable'
import EditsScreen, { backFromHistory } from '@/components/edit/EditsScreen'
import PersonWriter from '@/components/person/PersonWriter'
import Post from '@/components/Post'
import { attachTexts } from '@/i18n/attach'
import { EDIT_TEXTS, editTexts } from '@/i18n/edit'
import { personTexts } from '@/i18n/person'
import { demoId } from '@/lib/domain/ids'
import { dict } from '@/lib/i18n'
import { LOCALES } from '@/lib/i18n-base'
import { legalDict } from '@/lib/legal-i18n'
import { PersonError } from '@/lib/person/client'
import { forgetViewer } from '@/lib/person/viewer'
import { TOPICS } from '@/lib/social/demo-ids'
import type { EditHistory, ForumReply } from '@/lib/social/types'
import { NOW, pipa, post } from './help'

// the test browser (jsdom) has no Blob.arrayBuffer: the same read through FileReader, so the real check of the first bytes runs
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((ok, fail) => {
      const r = new FileReader()
      r.onload = () => ok(r.result as ArrayBuffer)
      r.onerror = () => fail(r.error)
      r.readAsArrayBuffer(this)
    })
  }
}

const d = dict('pt')
const et = editTexts('pt')
const ME = pipa.uid
const OTHER = demoId('rvr', 'outra')
const ob = (n: string) => demoId('ob', n)
const ED = { id: ob('ed1'), em: '2026-11-04T14:50:00.000Z', versoes: 3 }
const me = (extra: Record<string, unknown> = {}) => ({ uid: ME, handle: 'pipa', adult: true, head: null, profile: true, name: 'Pipa', consent: true, edit: true, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  forgetViewer()
  h.pessoa = null
  network.cliente = new FakeClient()
  h.personState.mockResolvedValue(me())
  h.publish.mockImplementation(async (type: string) => ({ id: type === 'resposta' ? ob('resp') : type === 'resposta-forum' ? ob('forum') : ob('novo') }))
  h.uploadMedia.mockResolvedValue(undefined)
  h.publishAttachment.mockResolvedValue({ id: ob('img') })
  h.prepareFile.mockImplementation(async () => ({ bytes: Uint8Array.of(1), hash: '1'.repeat(64), width: 1200, height: 800 }))
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

const ctx = (extra: Partial<ThreadContext> = {}): ThreadContext => ({
  topico: ob('topico'), resolvedId: null, autorDoTopico: OTHER, myUid: null, canWrite: false, responder: false, resolver: false, equipe: false, iAmModerator: false, ownerUid: OTHER, ...extra,
})
const forumReply = (extra: Partial<ForumReply> = {}): ForumReply => ({
  id: ob('fr1'), autor: pipa, texto: 'Eu levaria a lanterna.', criadoEm: '2026-11-04T14:30:00.000Z', em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 }, ...extra,
})
const editMenu = () => screen.findByRole('button', { name: et.edit, hidden: true })

describe('the mark "edited"', () => {
  it('a post shows it next to the time, says when and how many versions, and leads to the history', () => {
    render(<Post p={post({ edited: ED })} d={d} lang="pt" agora={NOW} />)
    const brand = screen.getByRole('link', { name: 'Editado há 10 min. Ver as 3 versões' })
    expect(brand).toHaveTextContent('editado')
    expect(brand).toHaveAttribute('href', `/pt/p/${post().id}/edicoes`)
    // right after the time, in the header
    expect(brand.previousElementSibling?.tagName).toBe('TIME')
  })
  it('a post that was never edited has no mark; a removed one neither', () => {
    const { unmount } = render(<Post p={post()} d={d} lang="pt" agora={NOW} />)
    expect(screen.queryByText('editado')).toBeNull()
    unmount()
    render(<Post p={post({ edited: ED, removida: true })} d={d} lang="pt" agora={NOW} />)
    expect(screen.queryByText('editado')).toBeNull()
  })
  it('a forum reply leads to the forum history; the post title shows when there is one', () => {
    render(<Reply r={forumReply({ edited: ED })} mae={ob('fr1')} c={ctx()} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByRole('link', { name: /^Editado/ })).toHaveAttribute('href', `/pt/t/${ob('fr1')}/edicoes`)
  })
  it('the 12 languages have every text, and none has a dash', () => {
    expect(Object.keys(EDIT_TEXTS).sort()).toEqual([...LOCALES].sort())
    expect(JSON.stringify(EDIT_TEXTS)).not.toMatch(/[–—]/)
  })
})

describe('"Edit" only on what is mine', () => {
  it('my post: the "..." menu offers Edit', async () => {
    render(<Post p={post()} d={d} lang="pt" agora={NOW} />)
    expect(await editMenu()).toBeInTheDocument()
    expect(h.personState).toHaveBeenCalledTimes(1)
  })
  it('somebody else\'s post, a relay without `edicao`, or a visitor: no Edit', async () => {
    const { unmount } = render(<Post p={post({ autor: { ...pipa, uid: OTHER } })} d={d} lang="pt" agora={NOW} />)
    await waitFor(() => expect(h.personState).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('button', { name: et.edit, hidden: true })).toBeNull()
    unmount()
    forgetViewer()
    h.personState.mockResolvedValue(me({ edit: false }))
    const b = render(<Post p={post()} d={d} lang="pt" agora={NOW} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: et.edit, hidden: true })).toBeNull()
    b.unmount()
    forgetViewer()
    h.personState.mockRejectedValue(new PersonError(401, 'sem_sessao'))
    render(<Post p={post()} d={d} lang="pt" agora={NOW} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: et.edit, hidden: true })).toBeNull()
  })
  it('one read of who is looking for the whole page, however many posts', async () => {
    render(
      <>
        {[1, 2, 3, 4].map((n) => (
          <Post key={n} p={post({ id: ob(`p${n}`) })} d={d} lang="pt" agora={NOW} />
        ))}
      </>,
    )
    await waitFor(() => expect(screen.getAllByRole('button', { name: et.edit, hidden: true })).toHaveLength(4))
    expect(h.personState).toHaveBeenCalledTimes(1)
  })
})

describe('saving an edit: the whole content, per type', () => {
  const user = () => userEvent.setup({ delay: null })
  it('a post: title (optional) and text start with what it says now; the topics and the 18+ mark go along unchanged', async () => {
    const u = user()
    render(<Post p={post({ titulo: 'Arquivo', topicos: ['arquivos'] })} d={d} lang="pt" agora={NOW} />)
    await u.click(await editMenu())
    const form = screen.getByRole('form', { name: et.formLabel })
    const title = within(form).getByLabelText(et.titleLabel) as HTMLInputElement
    const text = within(form).getByLabelText(et.textLabel) as HTMLTextAreaElement
    expect(title.value).toBe('Arquivo')
    expect(text.value).toBe('Abri uma pasta que ninguém visitava.')
    // nothing changed yet: nothing to save
    expect(within(form).getByRole('button', { name: et.save })).toBeDisabled()
    await u.clear(title)
    await u.clear(text)
    await u.type(text, 'Abri a pasta e achei um mapa.')
    await u.click(within(form).getByRole('button', { name: et.save }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('edicao', { alvo: post().id, titulo: null, texto: 'Abri a pasta e achei um mapa.', tags: ['arquivos'] }))
    expect(h.refresh).toHaveBeenCalled()
    // the editor closed: the page shows the text again (the refresh brings the new one)
    expect(screen.queryByRole('form', { name: et.formLabel })).toBeNull()
  })
  it('an 18+ post keeps the mark in the edit', async () => {
    const u = user()
    render(<Post p={post({ adulto: true, topicos: [] })} d={d} lang="pt" agora={NOW} />)
    await u.click(await editMenu())
    const text = screen.getByLabelText(et.textLabel)
    await u.type(text, ' Mais.')
    await u.click(screen.getByRole('button', { name: et.save }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('edicao', expect.objectContaining({ adulto: true, titulo: null, tags: [] })))
  })
  it('a reply: only the text, no title field', async () => {
    const u = user()
    render(<Post p={post({ id: ob('r1'), tipo: 'resposta', respondeA: ob('p01'), topicos: [] })} d={d} lang="pt" agora={NOW} />)
    await u.click(await editMenu())
    expect(screen.queryByLabelText(et.titleLabel)).toBeNull()
    expect(screen.getByLabelText(et.textLabel)).not.toHaveAttribute('maxlength')
    await u.type(screen.getByLabelText(et.textLabel), '!')
    await u.click(screen.getByRole('button', { name: et.save }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('edicao', { alvo: ob('r1'), titulo: null, texto: 'Abri uma pasta que ninguém visitava.!', tags: [] }))
  })
  it('a topic: title (required) and text; its tags go along', async () => {
    const u = user()
    render(
      <Editable alvo={{ id: ob('t1'), tipo: 'topico', autor: ME, conteudo: { titulo: 'Qual lanterna?', texto: 'Para a trilha.', tags: ['trilha'], adulto: false } }} lang="pt">
        <EditButton className="btn" />
        <EditableText>
          <p>Para a trilha.</p>
        </EditableText>
      </Editable>,
    )
    await u.click(await screen.findByRole('button', { name: et.edit }))
    const title = screen.getByLabelText(et.topicTitleLabel) as HTMLInputElement
    expect(title.value).toBe('Qual lanterna?')
    await u.clear(title)
    await u.type(title, 'ab')
    expect(screen.getByRole('alert')).toHaveTextContent(et.errors.title)
    expect(screen.getByRole('button', { name: et.save })).toBeDisabled()
    await u.type(title, 'c')
    await u.click(screen.getByRole('button', { name: et.save }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('edicao', { alvo: ob('t1'), titulo: 'abc', texto: 'Para a trilha.', tags: ['trilha'] }))
  })
  it('a forum reply: "Edit" in the action row, only the text', async () => {
    const u = user()
    render(<Reply r={forumReply()} mae={ob('fr1')} c={ctx()} d={d} lang="pt" agora={NOW} />)
    await u.click(await screen.findByRole('button', { name: et.edit }))
    const text = screen.getByLabelText(et.textLabel)
    await u.clear(text)
    await u.type(text, 'Eu levaria duas lanternas.')
    await u.click(screen.getByRole('button', { name: et.save }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('edicao', { alvo: ob('fr1'), titulo: null, texto: 'Eu levaria duas lanternas.', tags: [] }))
  })
  it('the leak detector runs while typing and holds the save', async () => {
    const u = user()
    render(<Reply r={forumReply()} mae={ob('fr1')} c={ctx()} d={d} lang="pt" agora={NOW} />)
    await u.click(await screen.findByRole('button', { name: et.edit }))
    await u.type(screen.getByLabelText(et.textLabel), ' ghp_abcdefghijklmnopqrstuvwxyz0123456789AB')
    expect(screen.getByRole('alert')).toHaveTextContent(legalDict('pt').vazamento.chave)
    expect(screen.getByRole('button', { name: et.save })).toBeDisabled()
  })
  it('a refusal by limit says when it unlocks; "nothing changed" and the others have their own sentence; Cancel puts the text back', async () => {
    const u = user()
    h.publish.mockRejectedValueOnce(new PersonError(429, 'limite_de_taxa', { retryAfterS: 700, limite: { max: 5, janelaS: 3600 } }))
    render(<Reply r={forumReply()} mae={ob('fr1')} c={ctx()} d={d} lang="pt" agora={NOW} />)
    await u.click(await screen.findByRole('button', { name: et.edit }))
    await u.type(screen.getByLabelText(et.textLabel), '!')
    await u.click(screen.getByRole('button', { name: et.save }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Você chegou ao limite de edições. Libera em 12 minutos.')
    for (const [code, text] of [['ja_existe', et.errors.same], ['limite_de_estrutura', et.errors.structure], ['trancado', et.errors.locked]] as const) {
      h.publish.mockRejectedValueOnce(new PersonError(409, code))
      await u.click(screen.getByRole('button', { name: et.save }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text))
    }
    expect(h.refresh).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: et.cancel }))
    expect(screen.queryByLabelText(et.textLabel)).toBeNull()
    expect(screen.getByText('Eu levaria a lanterna.')).toBeInTheDocument()
  })
})

describe('the public history', () => {
  const hist = (extra: Partial<EditHistory> = {}): EditHistory => ({
    alvo: ob('p1'),
    tipo: 'postagem',
    autor: pipa,
    dentroDe: null,
    itens: [
      { versao: 1, id: ob('p1'), criadoEm: '2026-11-04T13:00:00.000Z', titulo: null, texto: 'Primeira versão.', tags: [], adulto: false },
      { versao: 2, id: ob('e1'), criadoEm: '2026-11-04T14:00:00.000Z', titulo: 'Com título', texto: 'Segunda versão.', tags: ['folga'], adulto: true },
      { versao: 3, id: ob('e2'), criadoEm: '2026-11-04T14:50:00.000Z', titulo: null, texto: 'Terceira versão.', tags: [], adulto: false },
    ],
    ...extra,
  })
  it('lists every version newest first, with the date, the current one marked and the original named', () => {
    render(<EditsScreen h={hist()} d={d} lang="pt" agora={NOW} canAdult volta="/pt/p/x" />)
    expect(screen.getByRole('heading', { level: 1, name: et.history.title })).toBeInTheDocument()
    expect(screen.getByText('3 versões')).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: et.history.title })).getAllByRole('listitem').filter((li) => li.classList.contains('ed-version'))
    expect(items.map((li) => within(li).getByText(/^Versão \d$/).textContent)).toEqual(['Versão 3', 'Versão 2', 'Versão 1'])
    expect(items[0]).toHaveAttribute('aria-current', 'true')
    expect(within(items[0]).getByText(et.history.current)).toBeInTheDocument()
    expect(within(items[2]).getByText(et.history.original)).toBeInTheDocument()
    expect(within(items[0]).getByText('há 10 min')).toBeInTheDocument()
    expect(within(items[1]).getByText('Com título')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: et.history.back })).toHaveAttribute('href', `/pt/p/${ob('p1')}`)
  })
  it('an 18+ version stays behind the notice for whoever cannot see 18+', () => {
    render(<EditsScreen h={hist()} d={d} lang="pt" agora={NOW} canAdult={false} volta="/pt/p/x" />)
    expect(screen.queryByText('Segunda versão.')).toBeNull()
    expect(screen.getByText('Terceira versão.')).toBeInTheDocument()
    expect(screen.getByText(legalDict('pt').adulto.escondidoVisitante, { exact: false })).toBeInTheDocument()
  })
  it('back leads to the post, the post of a reply, the topic, or the topic at a forum reply', () => {
    expect(backFromHistory({ alvo: ob('r1'), tipo: 'resposta', dentroDe: ob('p1') }, 'pt')).toBe(`/pt/p/${ob('p1')}`)
    expect(backFromHistory({ alvo: ob('t1'), tipo: 'topico', dentroDe: null }, 'pt')).toBe(`/pt/t/${ob('t1')}`)
    expect(backFromHistory({ alvo: ob('fr1'), tipo: 'resposta-forum', dentroDe: ob('t1') }, 'en')).toBe(`/en/t/${ob('t1')}#r-${ob('fr1').slice(-12)}`)
  })
  it('nothing to show says so, with the way back', () => {
    render(<EditsScreen h={null} d={d} lang="pt" agora={NOW} canAdult={false} volta="/pt/p/x" />)
    expect(screen.getByText(et.history.notFound)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: et.history.back })).toHaveAttribute('href', '/pt/p/x')
  })
})

describe('a person replies', { timeout: 30_000 }, () => {
  const box = (mode: Parameters<typeof PersonWriter>[0]['mode'], media = false) =>
    render(<PersonWriter t={personTexts('pt')} at={attachTexts('pt')} media={media} leak={legalDict('pt').vazamento} lang="pt" consentHref="/pt/entrar" mode={mode} rt={et.reply} />)
  it('under a post: a `resposta` signed on the device, up to 1000 characters, with an image attached to the reply', async () => {
    const u = userEvent.setup({ delay: null })
    box({ kind: 'reply', alvo: ob('post') }, true)
    const text = await screen.findByLabelText(et.reply.label)
    expect(text).toHaveAttribute('maxlength', '1000')
    await u.upload(document.querySelector('input[type=file]') as HTMLInputElement, new File([Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1)], 'foto1.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    await u.type(text, 'Também vi esse mapa.')
    await u.click(screen.getByRole('button', { name: et.reply.send }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('resposta', { alvo: ob('post'), texto: 'Também vi esse mapa.' }))
    await waitFor(() => expect(h.publishAttachment).toHaveBeenCalledWith(expect.objectContaining({ hash: '1'.repeat(64) }), ob('resp'), 0, ''))
    expect(h.uploadMedia.mock.invocationCallOrder[0]).toBeLessThan(h.publish.mock.invocationCallOrder[0])
    expect(await screen.findByText(et.reply.sent)).toBeInTheDocument()
    expect(h.refresh).toHaveBeenCalled()
  })
  it('in the forum: a `resposta-forum` to the topic, up to 1500 characters', async () => {
    const u = userEvent.setup({ delay: null })
    box({ kind: 'forum', topico: ob('topico'), em: null, comunidade: ob('com'), acesso: 'aberta' })
    const text = await screen.findByLabelText(et.reply.label)
    expect(text).toHaveAttribute('maxlength', '1500')
    await u.type(text, 'Eu levaria a lanterna.')
    await u.click(screen.getByRole('button', { name: et.reply.send }))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith('resposta-forum', { topico: ob('topico'), em: null, cita: null, texto: 'Eu levaria a lanterna.' }))
  })
  it('not a member yet: the refusal says so and "join and reply" joins the open community, then sends the reply', async () => {
    const u = userEvent.setup({ delay: null })
    h.publish.mockRejectedValueOnce(new PersonError(403, 'nao_e_membro'))
    box({ kind: 'forum', topico: ob('topico'), em: null, comunidade: ob('com'), acesso: 'aberta' })
    await u.type(await screen.findByLabelText(et.reply.label), 'Oi, gente.')
    await u.click(screen.getByRole('button', { name: et.reply.send }))
    expect(await screen.findByRole('alert')).toHaveTextContent(et.reply.joinNeeded)
    h.publish.mockImplementationOnce(async () => ({ id: ob('ades'), resultado: 'membro' }))
    await u.click(screen.getByRole('button', { name: et.reply.join }))
    await waitFor(() => expect(h.publish.mock.calls.map((c) => c[0])).toEqual(['resposta-forum', 'comunidade-adesao', 'resposta-forum']))
    expect(h.publish.mock.calls[1][1]).toEqual({ comunidade: ob('com'), acao: 'entrar' })
    expect(await screen.findByText(et.reply.sent)).toBeInTheDocument()
  })
  it('a moderated community takes a request: the box says she replies once accepted; a closed one only takes invitations', async () => {
    const u = userEvent.setup({ delay: null })
    h.publish.mockRejectedValueOnce(new PersonError(403, 'nao_e_membro'))
    const a = box({ kind: 'forum', topico: ob('topico'), em: null, comunidade: ob('com'), acesso: 'moderada' })
    await u.type(await screen.findByLabelText(et.reply.label), 'Oi.')
    await u.click(screen.getByRole('button', { name: et.reply.send }))
    h.publish.mockImplementationOnce(async () => ({ id: ob('ades'), resultado: 'pendente' }))
    await u.click(await screen.findByRole('button', { name: et.reply.join }))
    expect(await screen.findByText(et.reply.joinPending)).toBeInTheDocument()
    expect(h.publish.mock.calls.map((c) => c[0])).toEqual(['resposta-forum', 'comunidade-adesao'])
    a.unmount()
    h.publish.mockRejectedValueOnce(new PersonError(403, 'nao_e_membro'))
    box({ kind: 'forum', topico: ob('topico'), em: null, comunidade: ob('com'), acesso: 'fechada' })
    await u.type(await screen.findByLabelText(et.reply.label), 'Oi.')
    await u.click(screen.getByRole('button', { name: et.reply.send }))
    expect(await screen.findByRole('alert')).toHaveTextContent(et.reply.joinClosed)
    expect(screen.queryByRole('button', { name: et.reply.join })).toBeNull()
  })
  it('the wait after joining says when it unlocks', async () => {
    const u = userEvent.setup({ delay: null })
    h.publish.mockRejectedValueOnce(new PersonError(403, 'em_carencia', { retryAfterS: 290 }))
    box({ kind: 'forum', topico: ob('topico'), em: null, comunidade: ob('com'), acesso: 'aberta' })
    await u.type(await screen.findByLabelText(et.reply.label), 'Oi.')
    await u.click(screen.getByRole('button', { name: et.reply.send }))
    expect(await screen.findByRole('alert')).toHaveTextContent(`${et.reply.wait} Libera em 5 minutos.`)
  })
})

describe('the pages', { timeout: 30_000 }, () => {
  const renderScreen = async (p: Promise<React.ReactElement>) => render(await p)
  const onePost = async () => (await new FakeClient().homeTimeline()).itens.find((p) => p.tipo === 'postagem')!.id
  it('a post, for a visitor: the invitation to sign in, and no reply box', async () => {
    await renderScreen(PostPage({ params: Promise.resolve({ lang: 'pt', id: await onePost() }) }))
    expect(screen.getByText(d.post.naoResponde)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: et.reply.inviteLink })).toHaveAttribute('href', '/pt/entrar')
    expect(screen.queryByLabelText(et.reply.label)).toBeNull()
  })
  it('a post, for a signed-in person: her reply box, and no invitation', async () => {
    h.pessoa = { id: 'p_ana' }
    await renderScreen(PostPage({ params: Promise.resolve({ lang: 'pt', id: await onePost() }) }))
    expect(await screen.findByLabelText(et.reply.label)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: et.reply.title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: et.reply.inviteLink })).toBeNull()
  })
  it('a forum topic: the person writes with her box; a visitor is invited', async () => {
    h.pessoa = { id: 'p_ana' }
    const a = await renderScreen(TopicPage({ params: Promise.resolve({ lang: 'pt', id: TOPICS.cinemaPopcorn }) }))
    expect(screen.getByRole('heading', { name: et.reply.forumTitle })).toBeInTheDocument()
    expect(await screen.findByLabelText(et.reply.label)).toHaveAttribute('maxlength', '1500')
    a.unmount()
    h.pessoa = null
    await renderScreen(TopicPage({ params: Promise.resolve({ lang: 'pt', id: TOPICS.cinemaPopcorn }) }))
    expect(screen.getByRole('link', { name: et.reply.inviteLink })).toHaveAttribute('href', '/pt/entrar')
    expect(screen.queryByLabelText(et.reply.label)).toBeNull()
  })
})
