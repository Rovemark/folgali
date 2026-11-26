import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { actAction } = vi.hoisted(() => ({ actAction: vi.fn(async () => ({ ok: true as const })) as ReturnType<typeof vi.fn> }))
vi.mock('@/app/social-actions', () => ({ actAction, moreAction: vi.fn(async () => null), markNoticesSeenAction: vi.fn(async () => undefined) }))
vi.mock('@/app/actions', () => ({ followAction: vi.fn(async () => ({ ok: true })), reactAction: vi.fn(async () => undefined) }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
// the empty state draws the rover, which uses IntersectionObserver (jsdom does not have it)
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import SentList from '@/components/profile/SentList'
import RemovedList from '@/components/profile/RemovedList'
import Medals from '@/components/profile/Medals'
import { dict } from '@/lib/i18n'
import { demoId } from '@/lib/domain/ids'
import type { TestimonialSent, Removed } from '@/lib/social/types'
import { NOW, pipa } from './help'

const ptd = dict('pt')
const end = dict('en')
const ob = (s: string) => demoId('ob', s)

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
})

describe('Medals: badges the reader already gave and when they can give', () => {
  const badges = { confiavel: 3, caprichoso: 0, rapido: 1, divertido: 2 }
  it('the badge already given has no give button (only the mark); the others keep the button', () => {
    render(<Medals selos={badges} targetUid={pipa.uid} can="sim" d={ptd} jaDeu={['rapido']} />)
    const items = screen.getAllByRole('listitem')
    const quick = items.find((li) => within(li).queryByText('Rápido', { selector: 'strong' }))!
    const trustworthy = items.find((li) => within(li).queryByText('Confiável', { selector: 'strong' }))!
    expect(within(quick).queryByRole('button')).toBeNull()
    expect(within(quick).getByText('Dado')).toBeInTheDocument()
    expect(within(quick).getByText(/Você já deu este selo/)).toBeInTheDocument()
    expect(within(trustworthy).getByRole('button')).toBeInTheDocument()
  })
  it('without the list (relay 0.3) all four badges have a button', () => {
    render(<Medals selos={badges} targetUid={pipa.uid} can="sim" d={ptd} />)
    expect(screen.getAllByRole('button')).toHaveLength(4)
    render(<Medals selos={badges} targetUid={pipa.uid} can="sim" d={ptd} jaDeu={[]} />)
    expect(screen.getAllByRole('button')).toHaveLength(8)
  })
  it('whoever already gave all four sees no button at all', () => {
    render(<Medals selos={badges} targetUid={pipa.uid} can="sim" d={ptd} jaDeu={['confiavel', 'caprichoso', 'rapido', 'divertido']} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('"no time" with the date says WHEN they can, in the screen\'s language; without the date the general 0.3 text stays', () => {
    const { unmount } = render(<Medals selos={badges} targetUid={pipa.uid} can="sem-tempo" d={ptd} podeEm="2026-11-10T12:00:00.000Z" lang="pt" />)
    expect(screen.getByText(/Você poderá dar selo a partir de/)).toBeInTheDocument()
    expect(screen.getByText(/10/)).toBeInTheDocument()
    expect(screen.queryByText(/Só amigo de 7 dias ou mais/)).toBeNull()
    unmount()
    const { unmount: u2 } = render(<Medals selos={badges} targetUid={pipa.uid} can="sem-tempo" d={ptd} />)
    expect(screen.getByText(/Só amigo de 7 dias ou mais/)).toBeInTheDocument()
    u2()
    render(<Medals selos={badges} targetUid={pipa.uid} can="sem-tempo" d={end} podeEm="2026-11-10T12:00:00.000Z" lang="en" />)
    expect(screen.getByText(/You will be able to give badges from/)).toBeInTheDocument()
  })
  it('the date only appears in "no time": in the other states it does not become text', () => {
    render(<Medals selos={badges} targetUid={pipa.uid} can="nao-amigo" d={ptd} podeEm="2026-11-10T12:00:00.000Z" />)
    expect(screen.queryByText(/Você poderá dar selo/)).toBeNull()
    expect(screen.getByText(/Selo é entre amigos/)).toBeInTheDocument()
  })
})

describe('ListaEnviados', () => {
  const sentValue = (id: string, text: string): TestimonialSent => ({ id: ob(id), alvo: { uid: pipa.uid, handle: 'pipa', nome: 'Pipa', rosto: pipa.rosto }, texto: text, criadoEm: '2026-11-05T14:00:00.000Z', estado: 'pendente' })
  it('shows the text, to whom it went and that it awaits the decision; nobody else sees this, and the text says so', () => {
    render(<SentList itens={[sentValue('d1', 'A Pipa leva lanterna.')]} d={ptd} lang="pt" agora={NOW} />)
    expect(screen.getByRole('heading', { name: 'Escritos por você, esperando aceite' })).toBeInTheDocument()
    expect(screen.getByText('A Pipa leva lanterna.')).toBeInTheDocument()
    expect(screen.getByText('Para Pipa')).toBeInTheDocument()
    expect(screen.getByText(/Esperando a decisão de Pipa/)).toBeInTheDocument()
    expect(screen.getByText(/Você e o dono são os únicos que veem|Você e ele são os únicos que veem/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Para Pipa/ })).toHaveAttribute('href', '/pt/r/pipa')
  })
  it('with no testimonial the section does not even appear', () => {
    const { container } = render(<SentList itens={[]} d={ptd} lang="pt" agora={NOW} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('a text with markup does not become an element (no HTML coming from the relay)', () => {
    render(<SentList itens={[sentValue('d2', '<img src=x onerror=alert(1)> oi')]} d={ptd} lang="pt" agora={NOW} />)
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })
})

describe('ListaRemovidos', () => {
  const removed = (extra: Partial<Removed> = {}): Removed => ({
    id: 'rem1', em: '2026-11-03T12:00:00.000Z', escopo: 'comunidade', contexto: ob('cpraia'), alvoTipo: 'topico', alvo: ob('tfeira'), motivo: 'spam', por: 'dono', apelacao: null,
    trecho: 'Quem quer trocar 14 canecas?', ...extra,
  })
  it('says what, where, by which ROLE (never the person), the reason and the retained excerpt', () => {
    render(<RemovedList itens={[removed()]} d={ptd} lang="pt" agora={NOW} />)
    expect(screen.getByRole('heading', { name: /O que foi removido/ })).toBeInTheDocument()
    expect(screen.getByText('Numa comunidade')).toBeInTheDocument()
    expect(screen.getByText(/por a pessoa dona/)).toBeInTheDocument()
    expect(screen.getByText('Propaganda ou repetição')).toBeInTheDocument()
    expect(screen.getByText('Quem quer trocar 14 canecas?')).toBeInTheDocument()
  })
  it('in a community with no appeal yet, leads to the appeal path with the id of what was removed', () => {
    render(<RemovedList itens={[removed()]} d={ptd} lang="pt" agora={NOW} />)
    expect(screen.getByRole('link', { name: 'Apelar' })).toHaveAttribute('href', `/pt/comunidades/${ob('cpraia')}/apelar?alvo=${ob('tfeira')}`)
  })
  it('an appeal already open, upheld or reverted shows the situation and does NOT offer to appeal again', () => {
    for (const [status, text] of [['aberta', /Apelação aberta/], ['mantida', /Apelação recusada/], ['revertida', /Apelação aceita/]] as const) {
      const { unmount } = render(<RemovedList itens={[removed({ apelacao: status })]} d={ptd} lang="pt" agora={NOW} />)
      expect(screen.getByText(text)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
      unmount()
    }
  })
  it('on a page, or through the relay, there is no appeal path here, and the screen says so', () => {
    const { unmount } = render(<RemovedList itens={[removed({ escopo: 'pagina' })]} d={ptd} lang="pt" agora={NOW} />)
    expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
    expect(screen.getByText(/não tem apelação por aqui/)).toBeInTheDocument()
    unmount()
    render(<RemovedList itens={[removed({ escopo: 'rele', contexto: null, por: 'rele' })]} d={ptd} lang="pt" agora={NOW} />)
    expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
  })
  it('after the deadline the relay no longer keeps the text, and the screen says so instead of staying blank', () => {
    render(<RemovedList itens={[removed({ trecho: null })]} d={ptd} lang="pt" agora={NOW} />)
    expect(screen.getByText('O relé já não guarda o texto removido.')).toBeInTheDocument()
  })
  it('empty list: the section exists and says nothing was removed', () => {
    render(<RemovedList itens={[]} d={ptd} lang="pt" agora={NOW} />)
    expect(screen.getByText('Nada do seu rover foi removido.')).toBeInTheDocument()
  })
  it('in English the texts come from the English dictionary', () => {
    render(<RemovedList itens={[removed({ apelacao: 'mantida' })]} d={end} lang="en" agora={NOW} />)
    expect(screen.getByText('In a community')).toBeInTheDocument()
    expect(screen.getByText(/Appeal denied/)).toBeInTheDocument()
  })
  it('the removed excerpt with markup does not become an element', () => {
    render(<RemovedList itens={[removed({ trecho: '<script>alert(1)</script> troca' })]} d={ptd} lang="pt" agora={NOW} />)
    expect(document.querySelector('script')).toBeNull()
  })
})
