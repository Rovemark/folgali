import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agirAcao } = vi.hoisted(() => ({ agirAcao: vi.fn(async () => ({ ok: true as const })) as ReturnType<typeof vi.fn> }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao, maisAcao: vi.fn(async () => null), marcarAvisosVistosAcao: vi.fn(async () => undefined) }))
vi.mock('@/app/acoes', () => ({ seguirAcao: vi.fn(async () => ({ ok: true })), reagirAcao: vi.fn(async () => undefined) }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import ListaRemovidos from '@/components/perfil/ListaRemovidos'
import Medalhas from '@/components/perfil/Medalhas'
import { dict } from '@/lib/i18n'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import type { Removido } from '@/lib/social/tipos'
import { AGORA, pipa } from './ajuda'

// Detalhes que o medidor de mutação mostrou sem teste: situação com a cor certa, "sem apelação" só quando é o caso, tipo do alvo, quando foi removido,
// a medalha vazia, a mensagem de "ninguém pode dar" e a data no idioma padrão.

const ptd = dict('pt')
const ob = (s: string) => idDeDemonstracao('ob', s)
const removido = (extra: Partial<Removido> = {}): Removido => ({
  id: 'rem1', em: '2026-11-03T12:00:00.000Z', escopo: 'comunidade', contexto: ob('cpraia'), alvoTipo: 'topico', alvo: ob('tfeira'), motivo: 'spam', por: 'dono', apelacao: null,
  trecho: 'Quem quer trocar 14 canecas?', ...extra,
})
const renderLista = (itens: Removido[]) => render(<ListaRemovidos itens={itens} d={ptd} lang="pt" agora={AGORA} />)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ListaRemovidos: situação da apelação', () => {
  it('aberta pede atenção (aviso), revertida é boa (ok), mantida não tem tom', () => {
    for (const [situacao, tom] of [['aberta', 'aviso'], ['revertida', 'ok'], ['mantida', null]] as const) {
      const { unmount } = renderLista([removido({ apelacao: situacao })])
      const pilula = screen.getByText(ptd.socAvisos.removidos.apelacao[situacao])
      if (tom) expect(pilula).toHaveAttribute('data-tom', tom)
      else expect(pilula).not.toHaveAttribute('data-tom')
      unmount()
    }
  })
  it('sem apelação nenhuma, nada de pílula de situação', () => {
    renderLista([removido()])
    for (const texto of Object.values(ptd.socAvisos.removidos.apelacao)) expect(screen.queryByText(texto)).toBeNull()
  })
})

describe('ListaRemovidos: "sem apelação por aqui" e o botão de apelar', () => {
  const semApelo = ptd.socAvisos.removidos.semApelo
  it('o aviso de "sem apelação" só aparece quando não há apelação e não há como apelar', () => {
    // página: sem apelação possível
    let r = renderLista([removido({ escopo: 'pagina' })])
    expect(screen.getByText(semApelo)).toBeInTheDocument()
    r.unmount()
    // comunidade sem apelação ainda: tem o botão, e o aviso NÃO aparece
    r = renderLista([removido()])
    expect(screen.getByRole('link', { name: 'Apelar' })).toBeInTheDocument()
    expect(screen.queryByText(semApelo)).toBeNull()
    r.unmount()
    // já apelou (qualquer situação): nem botão nem aviso
    for (const apelacao of ['aberta', 'mantida', 'revertida'] as const) {
      r = renderLista([removido({ apelacao })])
      expect(screen.queryByText(semApelo)).toBeNull()
      expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
      r.unmount()
    }
  })
  it('uma comunidade sem o id do lugar não tem para onde apelar: nada de link para /comunidades/null', () => {
    renderLista([removido({ contexto: null })])
    expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
    expect(screen.getByText(semApelo)).toBeInTheDocument()
    expect(document.querySelector('a[href*="null"]')).toBeNull()
  })
})

describe('ListaRemovidos: tipo do alvo e quando', () => {
  it('o tipo do alvo vira o nome da casa; um tipo desconhecido aparece como veio; sem tipo, sem pílula', () => {
    let r = renderLista([removido({ alvoTipo: 'topico' })])
    expect(screen.getByText('Tópico')).toBeInTheDocument()
    r.unmount()
    r = renderLista([removido({ alvoTipo: 'resposta-forum' })])
    expect(screen.getByText('Resposta')).toBeInTheDocument()
    r.unmount()
    r = renderLista([removido({ alvoTipo: 'coisa-nova' })])
    expect(screen.getByText('coisa-nova')).toBeInTheDocument()
    r.unmount()
    r = renderLista([removido({ alvoTipo: null })])
    const item = screen.getByRole('listitem')
    // só a pílula do escopo
    expect(item.querySelectorAll('.pilula')).toHaveLength(1)
    r.unmount()
  })
  it('diz há quanto tempo foi removido (de agora para trás, no relógio recebido)', () => {
    renderLista([removido({ em: '2026-11-03T12:00:00.000Z' })])
    expect(screen.getByText(/Removido há 1 d/)).toBeInTheDocument()
  })
  it('a seção tem o espaço de cima que a separa da lista anterior', () => {
    const { container } = renderLista([removido()])
    expect(container.querySelector('section.pf-removidos')).toHaveStyle({ marginTop: '28px' })
  })
})

describe('Medalhas: vazia, "ninguém" e data', () => {
  const zero = { confiavel: 0, caprichoso: 0, rapido: 0, divertido: 0 }
  const algum = { confiavel: 2, caprichoso: 0, rapido: 1, divertido: 0 }
  it('a medalha sem selo fica marcada como vazia, a que tem não, e cada uma leva a sua cor', () => {
    render(<Medalhas selos={algum} alvoUid={pipa.uid} pode="ninguem" d={ptd} />)
    const itens = screen.getAllByRole('listitem')
    expect(itens.map((li) => li.getAttribute('data-vazia'))).toEqual(['false', 'true', 'false', 'true'])
    expect(itens.map((li) => li.style.getPropertyValue('--h'))).toEqual(['255', '48', '155', '345'])
  })
  it('"ninguém pode dar" com a contagem toda zerada diz que ninguém deu; com selo ou em outro estado, não diz', () => {
    const nenhum = ptd.socPerfil.selos.nenhumTexto
    let r = render(<Medalhas selos={zero} alvoUid={pipa.uid} pode="ninguem" d={ptd} />)
    expect(screen.getByText(nenhum)).toBeInTheDocument()
    r.unmount()
    r = render(<Medalhas selos={algum} alvoUid={pipa.uid} pode="ninguem" d={ptd} />)
    expect(screen.queryByText(nenhum)).toBeNull()
    r.unmount()
    for (const pode of ['sim', 'nao-amigo', 'sem-tempo'] as const) {
      r = render(<Medalhas selos={zero} alvoUid={pipa.uid} pode={pode} d={ptd} />)
      expect(screen.queryByText(nenhum)).toBeNull()
      r.unmount()
    }
  })
  it('a razão de cada estado aparece só nele: amizade para quem não é amigo, tempo para quem é novo', () => {
    const { semAmizade, semPermissao } = ptd.socPerfil.selos
    let r = render(<Medalhas selos={algum} alvoUid={pipa.uid} pode="nao-amigo" d={ptd} />)
    expect(screen.getByText(semAmizade)).toBeInTheDocument()
    r.unmount()
    for (const pode of ['sim', 'sem-tempo', 'ninguem'] as const) {
      r = render(<Medalhas selos={algum} alvoUid={pipa.uid} pode={pode} d={ptd} />)
      expect(screen.queryByText(semAmizade)).toBeNull()
      r.unmount()
    }
    r = render(<Medalhas selos={algum} alvoUid={pipa.uid} pode="sem-tempo" d={ptd} />)
    expect(screen.getByText(semPermissao)).toBeInTheDocument()
    r.unmount()
  })
  it('sem dizer o idioma a data sai em português; e a marca de "já dado" só existe para quem pode dar', () => {
    const { unmount } = render(<Medalhas selos={algum} alvoUid={pipa.uid} pode="sem-tempo" d={ptd} podeEm="2026-11-10T12:00:00.000Z" />)
    expect(screen.getByText(/10 de nov\. de 2026/)).toBeInTheDocument()
    // a data entra NO LUGAR do marcador: o texto não carrega `{data}` e a frase vem completa
    expect(screen.getByText(/Você poderá dar selo a partir de 10 de nov\. de 2026/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('{data}')
    unmount()
    // quem não pode dar (ainda) não vê a marca de "dado" nem botão, mesmo que a lista exista
    render(<Medalhas selos={algum} alvoUid={pipa.uid} pode="sem-tempo" d={ptd} jaDeu={['confiavel']} />)
    expect(screen.queryByText(ptd.socPerfil.selos.dadoCurto)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    const confiavel = screen.getAllByRole('listitem').find((li) => within(li).queryByText('Confiável', { selector: 'strong' }))!
    expect(within(confiavel).queryByText(/Você já deu/)).toBeNull()
  })
})
