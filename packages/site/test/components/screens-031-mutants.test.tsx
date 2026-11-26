import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { actAction } = vi.hoisted(() => ({ actAction: vi.fn(async () => ({ ok: true as const })) as ReturnType<typeof vi.fn> }))
vi.mock('@/app/social-actions', () => ({ actAction, moreAction: vi.fn(async () => null), markNoticesSeenAction: vi.fn(async () => undefined) }))
vi.mock('@/app/actions', () => ({ followAction: vi.fn(async () => ({ ok: true })), reactAction: vi.fn(async () => undefined) }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import RemovedList from '@/components/profile/RemovedList'
import Medals from '@/components/profile/Medals'
import { dict } from '@/lib/i18n'
import { demoId } from '@/lib/domain/ids'
import type { Removed } from '@/lib/social/types'
import { NOW, pipa } from './help'

// Details the mutation testing showed without a test: the situation with the right color, "no appeal" only when that is the case, target type, when it was removed,
// the empty medal, the "nobody can give" message and the date in the default language.

const ptd = dict('pt')
const ob = (s: string) => demoId('ob', s)
const removed = (extra: Partial<Removed> = {}): Removed => ({
  id: 'rem1', em: '2026-11-03T12:00:00.000Z', escopo: 'comunidade', contexto: ob('cpraia'), alvoTipo: 'topico', alvo: ob('tfeira'), motivo: 'spam', por: 'dono', apelacao: null,
  trecho: 'Quem quer trocar 14 canecas?', ...extra,
})
const renderList = (items: Removed[]) => render(<RemovedList itens={items} d={ptd} lang="pt" agora={NOW} />)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RemovedList: appeal situation', () => {
  it('open asks for attention (warning), reverted is good (ok), upheld has no tone', () => {
    for (const [status, tone] of [['aberta', 'aviso'], ['revertida', 'ok'], ['mantida', null]] as const) {
      const { unmount } = renderList([removed({ apelacao: status })])
      const pill = screen.getByText(ptd.socAvisos.removidos.apelacao[status])
      if (tone) expect(pill).toHaveAttribute('data-tom', tone)
      else expect(pill).not.toHaveAttribute('data-tom')
      unmount()
    }
  })
  it('with no appeal at all, no situation pill', () => {
    renderList([removed()])
    for (const text of Object.values(ptd.socAvisos.removidos.apelacao)) expect(screen.queryByText(text)).toBeNull()
  })
})

describe('RemovedList: "no appeal here" and the appeal button', () => {
  const withoutAppeal = ptd.socAvisos.removidos.semApelo
  it('the "no appeal" notice only appears when there is no appeal and no way to appeal', () => {
    // page: no appeal possible
    let r = renderList([removed({ escopo: 'pagina' })])
    expect(screen.getByText(withoutAppeal)).toBeInTheDocument()
    r.unmount()
    // community with no appeal yet: has the button, and the notice does NOT appear
    r = renderList([removed()])
    expect(screen.getByRole('link', { name: 'Apelar' })).toBeInTheDocument()
    expect(screen.queryByText(withoutAppeal)).toBeNull()
    r.unmount()
    // already appealed (any situation): neither button nor notice
    for (const appeal of ['aberta', 'mantida', 'revertida'] as const) {
      r = renderList([removed({ apelacao: appeal })])
      expect(screen.queryByText(withoutAppeal)).toBeNull()
      expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
      r.unmount()
    }
  })
  it('a community without the place id has nowhere to appeal: no link to /comunidades/null', () => {
    renderList([removed({ contexto: null })])
    expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
    expect(screen.getByText(withoutAppeal)).toBeInTheDocument()
    expect(document.querySelector('a[href*="null"]')).toBeNull()
  })
})

describe('RemovedList: target type and when', () => {
  it('the target type becomes the house\'s name; an unknown type appears as it came; without a type, no pill', () => {
    let r = renderList([removed({ alvoTipo: 'topico' })])
    expect(screen.getByText('Tópico')).toBeInTheDocument()
    r.unmount()
    r = renderList([removed({ alvoTipo: 'resposta-forum' })])
    expect(screen.getByText('Resposta')).toBeInTheDocument()
    r.unmount()
    r = renderList([removed({ alvoTipo: 'coisa-nova' })])
    expect(screen.getByText('coisa-nova')).toBeInTheDocument()
    r.unmount()
    r = renderList([removed({ alvoTipo: null })])
    const item = screen.getByRole('listitem')
    // only the scope pill
    expect(item.querySelectorAll('.pill')).toHaveLength(1)
    r.unmount()
  })
  it('says how long ago it was removed (from now backwards, on the received clock)', () => {
    renderList([removed({ em: '2026-11-03T12:00:00.000Z' })])
    expect(screen.getByText(/Removido há 1 d/)).toBeInTheDocument()
  })
  it('the section has the top spacing that separates it from the previous list', () => {
    const { container } = renderList([removed()])
    expect(container.querySelector('section.pf-removidos')).toHaveStyle({ marginTop: '28px' })
  })
})

describe('Medals: empty, "nobody" and date', () => {
  const zero = { confiavel: 0, caprichoso: 0, rapido: 0, divertido: 0 }
  const some = { confiavel: 2, caprichoso: 0, rapido: 1, divertido: 0 }
  it('a medal without a badge is marked as empty, one with a badge is not, and each carries its color', () => {
    render(<Medals selos={some} targetUid={pipa.uid} can="ninguem" d={ptd} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-vazia'))).toEqual(['false', 'true', 'false', 'true'])
    expect(items.map((li) => li.style.getPropertyValue('--h'))).toEqual(['255', '48', '155', '345'])
  })
  it('"nobody can give" with the whole count zeroed says nobody gave; with a badge or in another state, it does not', () => {
    const none = ptd.socPerfil.selos.nenhumTexto
    let r = render(<Medals selos={zero} targetUid={pipa.uid} can="ninguem" d={ptd} />)
    expect(screen.getByText(none)).toBeInTheDocument()
    r.unmount()
    r = render(<Medals selos={some} targetUid={pipa.uid} can="ninguem" d={ptd} />)
    expect(screen.queryByText(none)).toBeNull()
    r.unmount()
    for (const can of ['sim', 'nao-amigo', 'sem-tempo'] as const) {
      r = render(<Medals selos={zero} targetUid={pipa.uid} can={can} d={ptd} />)
      expect(screen.queryByText(none)).toBeNull()
      r.unmount()
    }
  })
  it('the reason for each state appears only in it: friendship for a non-friend, time for a newcomer', () => {
    const { semAmizade: noFriendship, semPermissao: noPermission } = ptd.socPerfil.selos
    let r = render(<Medals selos={some} targetUid={pipa.uid} can="nao-amigo" d={ptd} />)
    expect(screen.getByText(noFriendship)).toBeInTheDocument()
    r.unmount()
    for (const can of ['sim', 'sem-tempo', 'ninguem'] as const) {
      r = render(<Medals selos={some} targetUid={pipa.uid} can={can} d={ptd} />)
      expect(screen.queryByText(noFriendship)).toBeNull()
      r.unmount()
    }
    r = render(<Medals selos={some} targetUid={pipa.uid} can="sem-tempo" d={ptd} />)
    expect(screen.getByText(noPermission)).toBeInTheDocument()
    r.unmount()
  })
  it('without the language, the date comes out in Portuguese; and the "already given" mark only exists for whoever can give', () => {
    const { unmount } = render(<Medals selos={some} targetUid={pipa.uid} can="sem-tempo" d={ptd} podeEm="2026-11-10T12:00:00.000Z" />)
    expect(screen.getByText(/10 de nov\. de 2026/)).toBeInTheDocument()
    // the date goes IN PLACE OF the placeholder: the text does not carry `{data}` and the sentence comes whole
    expect(screen.getByText(/Você poderá dar selo a partir de 10 de nov\. de 2026/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('{data}')
    unmount()
    // whoever cannot give (yet) sees neither the "given" mark nor a button, even if the list exists
    render(<Medals selos={some} targetUid={pipa.uid} can="sem-tempo" d={ptd} jaDeu={['confiavel']} />)
    expect(screen.queryByText(ptd.socPerfil.selos.dadoCurto)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    const trustworthy = screen.getAllByRole('listitem').find((li) => within(li).queryByText('Confiável', { selector: 'strong' }))!
    expect(within(trustworthy).queryByText(/Você já deu/)).toBeNull()
  })
})
