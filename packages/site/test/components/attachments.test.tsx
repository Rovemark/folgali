// Protocol 0.11.0 (`midia-livre`) on the screen: the person's composer attaches up to 4 images (choose, remove, describe, the order of
// what is sent, what stays when an image fails), the gallery of a post, a reply, a forum topic and a forum reply (an image with no
// description still has a name, each image opens larger and can be reported, what the moderation removed is said), and the report
// page of an attachment.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  personState: vi.fn(),
  publish: vi.fn(),
  uploadMedia: vi.fn(),
  publishAttachment: vi.fn(),
  prepareFile: vi.fn(),
  calls: [] as string[],
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))
vi.mock('@/app/actions', () => ({ reportAction: vi.fn(), reactAction: vi.fn(), deleteAction: vi.fn() }))
vi.mock('@/app/social-actions', () => ({ actAction: vi.fn(), moreAction: vi.fn(), proposeAction: vi.fn() }))
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

import Report from '@/app/[lang]/denunciar/[id]/page'
import { Reply, type ThreadContext } from '@/components/communities/Thread'
import { ImageGallery } from '@/components/NetworkImage'
import PersonWriter from '@/components/person/PersonWriter'
import Post from '@/components/Post'
import { ATTACH_TEXTS, attachTexts } from '@/i18n/attach'
import { personTexts } from '@/i18n/person'
import { dict } from '@/lib/i18n'
import { LOCALES } from '@/lib/i18n-base'
import type { NetworkImage as TImage } from '@/lib/images'
import { legalDict } from '@/lib/legal-i18n'
import { PersonError } from '@/lib/person/client'
import type { ForumReply } from '@/lib/social/types'
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
const t = attachTexts('pt')
const POST = `ob_${'P'.repeat(43)}`
const IMG = (c: string) => `ob_${c.repeat(43)}`
const hex = (n: number) => String(n).repeat(64)
const img = (n: number, alt = '', extra: Partial<TImage> = {}): TImage => ({ id: IMG(String(n)), hash: hex(n), formato: 'jpeg', largura: 1200, altura: 800, alt, ...extra })

/** A file whose first bytes are a JPEG; the name tells the stand-in of the canvas which picture it is. */
const jpeg = (name: string) => new File([Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3)], name, { type: 'image/jpeg' })
const n = (file: File) => Number(/\d+/.exec(file.name)?.[0] ?? 0)

beforeEach(() => {
  vi.clearAllMocks()
  h.calls.length = 0
  h.personState.mockResolvedValue({ uid: `rvr_${'P'.repeat(22)}`, handle: 'ana', adult: true, head: null, profile: true, name: 'Ana', consent: true })
  h.prepareFile.mockImplementation(async (file: File) => {
    if (file.name.startsWith('pesada')) throw new Error('too_big')
    if (file.name.startsWith('quebrada')) throw new Error('decode')
    return { bytes: Uint8Array.of(n(file)), hash: hex(n(file)), width: 1200, height: 800 }
  })
  h.uploadMedia.mockImplementation(async (p: { hash: string }) => { h.calls.push(`upload ${p.hash[0]}`) })
  h.publish.mockImplementation(async (type: string) => { h.calls.push(`publish ${type}`); return { id: POST } })
  h.publishAttachment.mockImplementation(async (p: { hash: string }, target: string, order: number, alt: string) => {
    h.calls.push(`attach ${p.hash[0]} em ${target === POST ? 'post' : target} ordem ${order} alt "${alt}"`)
    return { id: IMG('x') }
  })
  let k = 0
  URL.createObjectURL = vi.fn(() => `blob:previa-${++k}`)
  URL.revokeObjectURL = vi.fn()
})

async function composer({ media = true }: { media?: boolean } = {}) {
  const user = userEvent.setup({ delay: null })
  render(<PersonWriter t={personTexts('pt')} at={t} media={media} leak={legalDict('pt').vazamento} lang="pt" consentHref="/pt/entrar" />)
  const text = (await screen.findByLabelText('O que você quer contar?')) as HTMLTextAreaElement
  const file = () => document.querySelector('input[type=file]') as HTMLInputElement
  const pick = (...names: string[]) => user.upload(file(), names.map(jpeg))
  const previews = () => within(screen.getByRole('list', { name: 'Imagens escolhidas' })).getAllByRole('listitem')
  const publishButton = () => screen.getByRole('button', { name: /^Publica/ })
  return { user, text, file, pick, previews, publishButton }
}

// each of these walks the whole composer (mount, pick, type, publish): room to breathe on a busy machine
describe('the composer: attach image', { timeout: 30_000 }, () => {
  it('the button exists only while the relay announces `midia-livre`', async () => {
    const { file } = await composer({ media: false })
    expect(file()).toBeNull()
    expect(screen.queryByText('Anexar imagem')).toBeNull()
  })
  it('choose up to 4, each with a preview, a remove button and an optional description; the fifth is left out and said', async () => {
    const { pick, previews, file, user } = await composer()
    expect(screen.getByText('Anexar imagem')).toBeInTheDocument()
    expect(file()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(file().multiple).toBe(true)
    await pick('foto1.jpg', 'foto2.jpg', 'foto3.jpg')
    await waitFor(() => expect(previews()).toHaveLength(3))
    for (const [i, li] of previews().entries()) {
      expect(within(li).getByRole('button', { name: `Tirar a imagem ${i + 1}` })).toBeInTheDocument()
      const alt = within(li).getByLabelText(`Descrição da imagem ${i + 1} (opcional)`)
      expect(alt).toHaveAttribute('maxlength', '280')
      expect(alt).not.toBeRequired()
      expect(li.querySelector('img')).toHaveAttribute('src', `blob:previa-${i + 1}`)
    }
    await pick('foto4.jpg', 'foto5.jpg')
    await waitFor(() => expect(previews()).toHaveLength(4))
    expect(screen.getByRole('alert')).toHaveTextContent('Cada publicação leva até 4 imagens.')
    expect(file()).toBeDisabled()
    // remove the second: the others keep their order and the field opens again
    await user.click(screen.getByRole('button', { name: 'Tirar a imagem 2' }))
    expect(previews().map((li) => li.querySelector('img')!.getAttribute('src'))).toEqual(['blob:previa-1', 'blob:previa-3', 'blob:previa-4'])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa-2')
    expect(file()).not.toBeDisabled()
  })
  it('what the screen refuses before anything leaves: not an image by its bytes, the same image twice, one that cannot be opened or reduced', async () => {
    const { pick, previews, user, file } = await composer()
    await user.upload(file(), new File([new TextEncoder().encode('GIF89a........')], 'animada.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse arquivo não é JPEG, PNG nem WebP.')
    expect(h.prepareFile).not.toHaveBeenCalled()
    await pick('foto1.jpg')
    await waitFor(() => expect(previews()).toHaveLength(1))
    await pick('foto1.jpg')
    expect(await screen.findByRole('alert')).toHaveTextContent('Essa imagem já está na lista.')
    await pick('pesada9.jpg')
    expect(await screen.findByRole('alert')).toHaveTextContent('Essa imagem continua grande demais depois de reduzida.')
    await pick('quebrada8.jpg')
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para abrir essa imagem.')
    expect(previews()).toHaveLength(1)
  })
  it('the text stays required: with images and no text the screen says so and does not publish', async () => {
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg')
    await waitFor(() => expect(previews()).toHaveLength(1))
    expect(screen.getByText('Toda publicação precisa de texto. Escreva pelo menos uma palavra para ir com as imagens.')).toBeInTheDocument()
    expect(publishButton()).toBeDisabled()
    await user.type(text, 'Olha')
    expect(screen.queryByText(/Toda publicação precisa de texto/)).toBeNull()
    expect(publishButton()).toBeEnabled()
  })
  it('a description with an address stops the publication', async () => {
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg')
    await waitFor(() => expect(previews()).toHaveLength(1))
    await user.type(text, 'Olha')
    await user.type(screen.getByLabelText('Descrição da imagem 1 (opcional)'), 'veja em https://exemplo.com')
    expect(screen.getByText('A descrição não pode ter endereço de site.')).toBeInTheDocument()
    expect(publishButton()).toBeDisabled()
  })
  it('order: every file is uploaded first, then the post, then one `imagem` per image in order, with the description or an empty one', async () => {
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg', 'foto2.jpg', 'foto3.jpg')
    await waitFor(() => expect(previews()).toHaveLength(3))
    await user.type(text, '  Três fotos da folga  ')
    await user.type(screen.getByLabelText('Descrição da imagem 2 (opcional)'), 'Um gato no teclado.')
    await user.click(publishButton())
    expect(await screen.findByText('Publicado.')).toBeInTheDocument()
    expect(h.calls).toEqual([
      'upload 1', 'upload 2', 'upload 3',
      'publish postagem',
      'attach 1 em post ordem 0 alt ""', 'attach 2 em post ordem 1 alt "Um gato no teclado."', 'attach 3 em post ordem 2 alt ""',
    ])
    expect(h.publish).toHaveBeenCalledWith('postagem', { texto: 'Três fotos da folga', topicos: [] })
    // the composer is clean for the next one
    expect(text.value).toBe('')
    expect(screen.queryByRole('list', { name: 'Imagens escolhidas' })).toBeNull()
  })
  it('progress is said while it happens: "Enviando imagem 2 de 3"', async () => {
    const gates: (() => void)[] = []
    h.uploadMedia.mockImplementation((p: { hash: string }) => new Promise<void>((ok) => gates.push(() => { h.calls.push(`upload ${p.hash[0]}`); ok() })))
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg', 'foto2.jpg', 'foto3.jpg')
    await waitFor(() => expect(previews()).toHaveLength(3))
    await user.type(text, 'Olha')
    await user.click(publishButton())
    const status = () => screen.getAllByRole('status').map((e) => e.textContent).join('|')
    await waitFor(() => expect(status()).toContain('Enviando imagem 1 de 3'))
    await act(async () => gates[0]())
    await waitFor(() => expect(status()).toContain('Enviando imagem 2 de 3'))
    expect(h.publish).not.toHaveBeenCalled()
    await act(async () => gates[1]())
    await waitFor(() => expect(gates).toHaveLength(3))
    await act(async () => gates[2]())
    expect(await screen.findByText('Publicado.')).toBeInTheDocument()
    expect(status()).not.toMatch(/Enviando|Anexando/)
  })
  it('a file refused on upload: nothing is published, the screen says which image and why, and the choice is kept', async () => {
    h.uploadMedia.mockImplementation(async (p: { hash: string }) => {
      if (p.hash[0] === '2') throw new PersonError(415, 'formato_nao_aceito')
      h.calls.push(`upload ${p.hash[0]}`)
    })
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg', 'foto2.jpg', 'foto3.jpg')
    await waitFor(() => expect(previews()).toHaveLength(3))
    await user.type(text, 'Olha')
    await user.click(publishButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('A imagem 2 não foi enviada, então nada foi publicado.')
    expect(h.calls).toEqual(['upload 1'])
    expect(h.publish).not.toHaveBeenCalled()
    expect(h.publishAttachment).not.toHaveBeenCalled()
    expect(previews()).toHaveLength(3)
    expect(text.value).toBe('Olha')
  })
  it('the post limit: the refusal says when it unblocks, and nothing the person prepared is lost', async () => {
    h.publish.mockRejectedValue(new PersonError(429, 'limite_de_taxa', { retryAfterS: 720, limite: { max: 10, janelaS: 60 }, libera: 'Espere.' }))
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg')
    await waitFor(() => expect(previews()).toHaveLength(1))
    await user.type(text, 'Olha')
    await user.click(publishButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Você chegou ao limite de postagens. Libera em 12 minutos.')
    expect(h.publishAttachment).not.toHaveBeenCalled()
    expect(previews()).toHaveLength(1)
    expect(text.value).toBe('Olha')
  })
  it('image 2 fails after the post is out: the post stays, the screen says which one did not go, and "try again" sends only that one', async () => {
    let fail = true
    h.publishAttachment.mockImplementation(async (p: { hash: string }, target: string, order: number) => {
      if (p.hash[0] === '2' && fail) throw new PersonError(429, 'limite_de_taxa', { retryAfterS: 720 })
      h.calls.push(`attach ${p.hash[0]} ordem ${order} ${target === POST ? 'no mesmo post' : 'em outro'}`)
      return { id: IMG('x') }
    })
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg', 'foto2.jpg', 'foto3.jpg')
    await waitFor(() => expect(previews()).toHaveLength(3))
    await user.type(text, 'Olha')
    await user.click(publishButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('A postagem foi publicada, mas a imagem 2 não entrou.')
    expect(alert).toHaveTextContent('Imagem 2 de 3')
    expect(alert).toHaveTextContent('Você chegou ao limite de imagens. Libera em 12 minutos.')
    // the other two went, in their own positions, and the post was published once
    expect(h.calls).toEqual(['upload 1', 'upload 2', 'upload 3', 'publish postagem', 'attach 1 ordem 0 no mesmo post', 'attach 3 ordem 2 no mesmo post'])
    expect(within(alert).getByRole('link')).toHaveAttribute('href', `/pt/p/${POST}`)
    expect(screen.queryByText('Publicado.')).toBeNull()
    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('As imagens que faltavam entraram.')).toBeInTheDocument()
    expect(h.calls.slice(6)).toEqual(['attach 2 ordem 1 no mesmo post'])
    expect(h.publish).toHaveBeenCalledTimes(1)
    expect(h.uploadMedia).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('two that failed are named together; a retry that fails again keeps the offer; "leave it" ends it with the post published', async () => {
    h.publishAttachment.mockImplementation(async (p: { hash: string }) => {
      if (p.hash[0] !== '1') throw new PersonError(507, 'cota_de_midia')
      return { id: IMG('x') }
    })
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg', 'foto2.jpg', 'foto3.jpg')
    await waitFor(() => expect(previews()).toHaveLength(3))
    await user.type(text, 'Olha')
    await user.click(publishButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('A postagem foi publicada, mas estas imagens não entraram: 2 e 3.')
    expect(within(alert).getAllByText('A folgali está sem espaço para imagens agora. Tente mais tarde.')).toHaveLength(2)
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(h.publishAttachment).toHaveBeenCalledTimes(5))
    expect(await screen.findByRole('alert')).toHaveTextContent('estas imagens não entraram: 2 e 3.')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Deixar assim' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Publicado.')).toBeInTheDocument()
    expect(h.publish).toHaveBeenCalledTimes(1)
  })
  it('on a retry, an upload the relay no longer holds is sent again before the object; an image that was already there counts as done', async () => {
    let round = 0
    h.publishAttachment.mockImplementation(async (p: { hash: string }) => {
      round++
      if (round === 1) throw new PersonError(500, 'erro_interno')
      if (round === 2) throw new PersonError(409, 'midia_ausente')
      h.calls.push(`attach ${p.hash[0]}`)
      return { id: IMG('x') }
    })
    const { pick, previews, publishButton, text, user } = await composer()
    await pick('foto1.jpg')
    await waitFor(() => expect(previews()).toHaveLength(1))
    await user.type(text, 'Olha')
    await user.click(publishButton())
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('As imagens que faltavam entraram.')).toBeInTheDocument()
    expect(h.calls).toEqual(['upload 1', 'publish postagem', 'upload 1', 'attach 1'])
    // the answer of the first try was lost on the way, the image is on the post: `ja_existe` on the retry is success
    vi.clearAllMocks()
    round = 0
    h.publishAttachment.mockImplementation(async () => {
      round++
      throw new PersonError(round === 1 ? 502 : 409, round === 1 ? 'rele' : 'ja_existe')
    })
    await pick('foto2.jpg')
    await waitFor(() => expect(previews()).toHaveLength(1))
    await user.type(text, 'De novo')
    await user.click(publishButton())
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('As imagens que faltavam entraram.')).toBeInTheDocument()
  })
})

describe('the gallery of a publication', { timeout: 20_000 }, () => {
  const g = d.midia.galeria
  it('an image with no description gets a generic name with the author; none is left with an empty alt', () => {
    render(<Post p={post({ imagens: [img(1), img(2, 'Um gato no teclado.')] })} d={d} lang="pt" agora={NOW} />)
    const list = screen.getByRole('list', { name: g })
    expect(list).toHaveAttribute('data-n', '2')
    expect(within(list).getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['Imagem publicada por Pipa', 'Um gato no teclado.'])
    for (const i of within(list).getAllByRole('img')) {
      expect(i.getAttribute('alt')!.trim()).not.toBe('')
      expect(i.getAttribute('src')).toMatch(/^\/midia\/[0-9a-f]{64}\.jpg$/)
      expect(i).toHaveAttribute('loading', 'lazy')
    }
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Ampliar: Imagem publicada por Pipa', 'Ampliar: Um gato no teclado.'])
  })
  it('1, 2, 3 and 4 images: the grid knows how many it has, and never shows more than 4', () => {
    for (const k of [1, 2, 3, 4, 6]) {
      const { unmount } = render(<Post p={post({ imagens: Array.from({ length: k }, (_, i) => img(i + 1)) })} d={d} lang="pt" agora={NOW} />)
      const list = screen.getByRole('list', { name: g })
      expect(list).toHaveAttribute('data-n', String(Math.min(k, 4)))
      expect(within(list).getAllByRole('img')).toHaveLength(Math.min(k, 4))
      unmount()
    }
  })
  it('each image has "Report image", a link to the report page of its own object; the reader\'s own images have none', () => {
    const p = post({ id: POST, imagens: [img(1), img(2), { ...img(3), id: undefined }] })
    const { unmount } = render(<Post p={p} d={d} lang="pt" agora={NOW} />)
    const links = within(screen.getByRole('list', { name: g })).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Denunciar a imagem 1', 'Denunciar a imagem 2'])
    expect(links[0]).toHaveAttribute('href', `/pt/denunciar/${IMG('1')}?tipo=imagem&de=pipa&volta=${encodeURIComponent(`/p/${POST}`)}`)
    expect(links[1]).toHaveAttribute('href', `/pt/denunciar/${IMG('2')}?tipo=imagem&de=pipa&volta=${encodeURIComponent(`/p/${POST}`)}`)
    unmount()
    // one image only: the plain label
    const one = render(<Post p={post({ imagens: [img(1)] })} d={d} lang="pt" agora={NOW} />)
    expect(within(screen.getByRole('list', { name: g })).getByRole('link')).toHaveAccessibleName('Denunciar imagem')
    one.unmount()
    render(<Post p={p} d={d} lang="pt" agora={NOW} myUid={pipa.uid} />)
    expect(within(screen.getByRole('list', { name: g })).queryAllByRole('link')).toEqual([])
  })
  it('"removed by moderation": one, several, and when no image is left; nothing on a deleted post', () => {
    const one = render(<Post p={post({ imagens: [img(1)], anexosRemovidos: 1 })} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText('Uma imagem foi removida pela moderação.')).toBeInTheDocument()
    one.unmount()
    const many = render(<Post p={post({ imagens: [img(1)], anexosRemovidos: 3 })} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText('3 imagens foram removidas pela moderação.')).toBeInTheDocument()
    many.unmount()
    const none = render(<Post p={post({ anexosRemovidos: 2 })} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText('2 imagens foram removidas pela moderação.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: g })).toBeNull()
    none.unmount()
    const clean = render(<Post p={post({ imagens: [img(1)] })} d={d} lang="pt" agora={NOW} />)
    expect(screen.queryByText(/removida pela moderação/)).toBeNull()
    clean.unmount()
    const { container } = render(<Post p={post({ imagens: [img(1)], anexosRemovidos: 1, removida: true })} d={d} lang="pt" agora={NOW} />)
    expect(container.querySelector('.gallery, .gallery-removed')).toBeNull()
  })
  it('18+: the attachments stay behind the same notice as the text, and do not exist when the text was withheld', () => {
    const { container, unmount } = render(<Post p={post({ adulto: true, imagens: [img(1)] })} d={d} lang="pt" agora={NOW} />)
    const fold = container.querySelector('details.adult-hidden')!
    expect(fold).not.toHaveAttribute('open')
    expect(fold.querySelector('.gallery img')).not.toBeNull()
    expect(container.querySelectorAll('.gallery')).toHaveLength(1)
    unmount()
    const hidden = render(<Post p={post({ adulto: true, adultHidden: true, texto: '', imagens: [img(1)], anexosRemovidos: 1 })} d={d} lang="pt" agora={NOW} />)
    expect(hidden.container.querySelector('.gallery, .gallery-removed, img[src^="/midia/"]')).toBeNull()
  })
  it('tapping an image opens it larger: position, previous and next, the arrow keys, the description, report, and close', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<Post p={post({ id: POST, imagens: [img(1), img(2, 'Um gato no teclado.')] })} d={d} lang="pt" agora={NOW} />)
    const viewer = container.querySelector('dialog.viewer') as HTMLDialogElement
    expect(viewer).toHaveAttribute('aria-label', 'Imagem ampliada')
    expect(viewer.querySelector('img')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ampliar: Um gato no teclado.' }))
    const big = () => viewer.querySelector('img.viewer-img') as HTMLImageElement
    expect(viewer.open || viewer.hasAttribute('open')).toBe(true)
    expect(big()).toHaveAttribute('src', `/midia/${hex(2)}.jpg`)
    expect(big()).toHaveAttribute('alt', 'Um gato no teclado.')
    expect(within(viewer).getByText('Imagem 2 de 2')).toBeInTheDocument()
    expect(viewer.querySelector('.viewer-caption')).toHaveTextContent('Um gato no teclado.')
    expect(viewer.querySelector('a.viewer-report')).toHaveAttribute('href', expect.stringContaining(`/pt/denunciar/${IMG('2')}?tipo=imagem`))
    fireEvent.click(viewer.querySelector('button[aria-label="Próxima imagem"]')!)
    expect(big()).toHaveAttribute('src', `/midia/${hex(1)}.jpg`)
    // the image nobody described: its generic name, and no caption pretending the author wrote one
    expect(big()).toHaveAttribute('alt', 'Imagem publicada por Pipa')
    expect(viewer.querySelector('.viewer-caption')).toBeNull()
    fireEvent.click(viewer.querySelector('button[aria-label="Imagem anterior"]')!)
    expect(within(viewer).getByText('Imagem 2 de 2')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(within(viewer).getByText('Imagem 1 de 2')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(within(viewer).getByText('Imagem 2 de 2')).toBeInTheDocument()
    fireEvent.click(viewer.querySelector('button[aria-label="Fechar"]')!)
    expect(viewer.open || viewer.hasAttribute('open')).toBe(false)
    expect(viewer.querySelector('img')).toBeNull()
    // Escape on a modal dialog is the browser's own: it fires `close`, and the screen forgets the image
    await user.click(screen.getByRole('button', { name: 'Ampliar: Imagem publicada por Pipa' }))
    expect(big()).not.toBeNull()
    fireEvent(viewer, new Event('close'))
    expect(viewer.querySelector('img')).toBeNull()
  })
  it('one image alone: no previous, no next, no position', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<Post p={post({ imagens: [img(1, 'Só uma.')] })} d={d} lang="pt" agora={NOW} />)
    await user.click(screen.getByRole('button', { name: 'Ampliar: Só uma.' }))
    const viewer = container.querySelector('dialog.viewer')!
    expect(viewer.querySelector('img.viewer-img')).not.toBeNull()
    expect(viewer.querySelectorAll('.viewer-arrow')).toHaveLength(0)
    expect(viewer.querySelector('.viewer-position')).toHaveTextContent('')
  })
  it('a forum reply shows its own attachments, with the report going back to the topic', () => {
    const TOPIC = `ob_${'T'.repeat(43)}`
    const r: ForumReply = { id: `ob_${'R'.repeat(43)}`, autor: pipa, texto: 'Olha a praça.', criadoEm: '2026-11-04T14:40:00.000Z', em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 }, imagens: [img(1)], anexosRemovidos: 1 }
    const c: ThreadContext = { topico: TOPIC, resolvedId: null, autorDoTopico: 'rvr_x', myUid: null, canWrite: false, responder: false, resolver: false, equipe: false, iAmModerator: false, ownerUid: '' }
    const first = render(<Reply r={r} mae={r.id} c={c} d={d} lang="pt" agora={NOW} />)
    const list = screen.getByRole('list', { name: 'Imagens anexadas' })
    expect(within(list).getByRole('img')).toHaveAttribute('alt', 'Imagem publicada por Pipa')
    expect(within(list).getByRole('link')).toHaveAttribute('href', `/pt/denunciar/${IMG('1')}?tipo=imagem&de=pipa&volta=${encodeURIComponent(`/t/${TOPIC}`)}`)
    expect(screen.getByText('Uma imagem foi removida pela moderação.')).toBeInTheDocument()
    first.unmount()
    // her own reply: nothing to report; a removed reply: no image
    const own = render(<Reply r={r} mae={r.id} c={{ ...c, myUid: pipa.uid }} d={d} lang="pt" agora={NOW} />)
    expect(within(screen.getByRole('list', { name: 'Imagens anexadas' })).queryByRole('link')).toBeNull()
    own.unmount()
    const { container } = render(<Reply r={{ ...r, removida: true }} mae={r.id} c={c} d={d} lang="pt" agora={NOW} />)
    expect(container.querySelector('.gallery, .gallery-removed')).toBeNull()
  })
  it('in the 12 languages the image with no description has a name, and the note reads in that language', () => {
    for (const l of LOCALES) {
      const { unmount, container } = render(<ImageGallery imagens={[img(1)]} rotulo="g" t={ATTACH_TEXTS[l].gallery} autor={{ nome: 'Ana', handle: 'ana' }} lang={l} removidos={2} />)
      const name = screen.getByRole('img').getAttribute('alt')!
      expect(name, l).toContain('Ana')
      expect(name.length, l).toBeGreaterThan('Ana'.length + 2)
      expect(container.querySelector('.gallery-removed'), l).toHaveTextContent('2')
      unmount()
    }
  })
})

describe('the report page of an attachment', { timeout: 20_000 }, () => {
  const page = async (search: Record<string, string>) => render(await Report({ params: Promise.resolve({ lang: 'pt', id: IMG('1') }), searchParams: Promise.resolve(search) }))
  it('says it is an image and whose, and sends the id of the image object', async () => {
    const { container } = await page({ tipo: 'imagem', de: 'ana', volta: `/p/${POST}` })
    expect(screen.getByText('Imagem denunciada')).toBeInTheDocument()
    expect(screen.getByText('Imagem publicada por @ana')).toBeInTheDocument()
    expect(screen.queryByText(/Foto do perfil/)).toBeNull()
    expect(container.querySelector('input[name=alvo]')).toHaveValue(IMG('1'))
  })
  it('with no author in the address it still fits an attachment, and a handle that is not one is ignored', async () => {
    const first = await page({ tipo: 'imagem' })
    expect(screen.getByText('Imagem anexada a uma publicação')).toBeInTheDocument()
    first.unmount()
    await page({ tipo: 'imagem', de: '<script>' })
    expect(screen.getByText('Imagem anexada a uma publicação')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('<script>')
  })
})
