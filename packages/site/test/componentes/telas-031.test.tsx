import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agirAcao } = vi.hoisted(() => ({ agirAcao: vi.fn(async () => ({ ok: true as const })) as ReturnType<typeof vi.fn> }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao, maisAcao: vi.fn(async () => null), marcarAvisosVistosAcao: vi.fn(async () => undefined) }))
vi.mock('@/app/acoes', () => ({ seguirAcao: vi.fn(async () => ({ ok: true })), reagirAcao: vi.fn(async () => undefined) }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
// o estado vazio desenha o rover, que usa IntersectionObserver (o jsdom não tem)
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import ListaEnviados from '@/components/perfil/ListaEnviados'
import ListaRemovidos from '@/components/perfil/ListaRemovidos'
import Medalhas from '@/components/perfil/Medalhas'
import { dict } from '@/lib/i18n'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import type { DepoimentoEnviado, Removido } from '@/lib/social/tipos'
import { AGORA, pipa } from './ajuda'

const ptd = dict('pt')
const end = dict('en')
const ob = (s: string) => idDeDemonstracao('ob', s)

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
})

describe('Medalhas: selos que o leitor já deu e quando poderá dar', () => {
  const selos = { confiavel: 3, caprichoso: 0, rapido: 1, divertido: 2 }
  it('o selo já dado não tem botão de dar (só a marca); os outros continuam com o botão', () => {
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sim" d={ptd} jaDeu={['rapido']} />)
    const itens = screen.getAllByRole('listitem')
    const rapido = itens.find((li) => within(li).queryByText('Rápido', { selector: 'strong' }))!
    const confiavel = itens.find((li) => within(li).queryByText('Confiável', { selector: 'strong' }))!
    expect(within(rapido).queryByRole('button')).toBeNull()
    expect(within(rapido).getByText('Dado')).toBeInTheDocument()
    expect(within(rapido).getByText(/Você já deu este selo/)).toBeInTheDocument()
    expect(within(confiavel).getByRole('button')).toBeInTheDocument()
  })
  it('sem a lista (relé 0.3) todos os quatro selos têm botão', () => {
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sim" d={ptd} />)
    expect(screen.getAllByRole('button')).toHaveLength(4)
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sim" d={ptd} jaDeu={[]} />)
    expect(screen.getAllByRole('button')).toHaveLength(8)
  })
  it('quem já deu os quatro não vê botão nenhum', () => {
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sim" d={ptd} jaDeu={['confiavel', 'caprichoso', 'rapido', 'divertido']} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('"sem tempo" com a data diz QUANDO poderá, no idioma da tela; sem a data fica o texto geral da 0.3', () => {
    const { unmount } = render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sem-tempo" d={ptd} podeEm="2026-11-10T12:00:00.000Z" lang="pt" />)
    expect(screen.getByText(/Você poderá dar selo a partir de/)).toBeInTheDocument()
    expect(screen.getByText(/10/)).toBeInTheDocument()
    expect(screen.queryByText(/Só amigo de 7 dias ou mais/)).toBeNull()
    unmount()
    const { unmount: u2 } = render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sem-tempo" d={ptd} />)
    expect(screen.getByText(/Só amigo de 7 dias ou mais/)).toBeInTheDocument()
    u2()
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="sem-tempo" d={end} podeEm="2026-11-10T12:00:00.000Z" lang="en" />)
    expect(screen.getByText(/You will be able to give badges from/)).toBeInTheDocument()
  })
  it('a data só aparece em "sem tempo": nos outros estados ela não vira texto', () => {
    render(<Medalhas selos={selos} alvoUid={pipa.uid} pode="nao-amigo" d={ptd} podeEm="2026-11-10T12:00:00.000Z" />)
    expect(screen.queryByText(/Você poderá dar selo/)).toBeNull()
    expect(screen.getByText(/Selo é entre amigos/)).toBeInTheDocument()
  })
})

describe('ListaEnviados', () => {
  const enviado = (id: string, texto: string): DepoimentoEnviado => ({ id: ob(id), alvo: { uid: pipa.uid, handle: 'pipa', nome: 'Pipa', rosto: pipa.rosto }, texto, criadoEm: '2026-11-05T14:00:00.000Z', estado: 'pendente' })
  it('mostra o texto, para quem foi e que espera a decisão; ninguém mais vê isto, e o texto diz isso', () => {
    render(<ListaEnviados itens={[enviado('d1', 'A Pipa leva lanterna.')]} d={ptd} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('heading', { name: 'Escritos por você, esperando aceite' })).toBeInTheDocument()
    expect(screen.getByText('A Pipa leva lanterna.')).toBeInTheDocument()
    expect(screen.getByText('Para Pipa')).toBeInTheDocument()
    expect(screen.getByText(/Esperando a decisão de Pipa/)).toBeInTheDocument()
    expect(screen.getByText(/Você e o dono são os únicos que veem|Você e ele são os únicos que veem/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Para Pipa/ })).toHaveAttribute('href', '/pt/r/pipa')
  })
  it('sem nenhum depoimento a seção nem aparece', () => {
    const { container } = render(<ListaEnviados itens={[]} d={ptd} lang="pt" agora={AGORA} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('um texto com marcação não vira elemento (nada de HTML vindo do relé)', () => {
    render(<ListaEnviados itens={[enviado('d2', '<img src=x onerror=alert(1)> oi')]} d={ptd} lang="pt" agora={AGORA} />)
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })
})

describe('ListaRemovidos', () => {
  const removido = (extra: Partial<Removido> = {}): Removido => ({
    id: 'rem1', em: '2026-11-03T12:00:00.000Z', escopo: 'comunidade', contexto: ob('cpraia'), alvoTipo: 'topico', alvo: ob('tfeira'), motivo: 'spam', por: 'dono', apelacao: null,
    trecho: 'Quem quer trocar 14 canecas?', ...extra,
  })
  it('diz o quê, onde, por qual PAPEL (nunca a pessoa), o motivo e o trecho retido', () => {
    render(<ListaRemovidos itens={[removido()]} d={ptd} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('heading', { name: /O que foi removido/ })).toBeInTheDocument()
    expect(screen.getByText('Numa comunidade')).toBeInTheDocument()
    expect(screen.getByText(/por a pessoa dona/)).toBeInTheDocument()
    expect(screen.getByText('Propaganda ou repetição')).toBeInTheDocument()
    expect(screen.getByText('Quem quer trocar 14 canecas?')).toBeInTheDocument()
  })
  it('numa comunidade sem apelação ainda, leva ao caminho de apelar com o id do que foi removido', () => {
    render(<ListaRemovidos itens={[removido()]} d={ptd} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('link', { name: 'Apelar' })).toHaveAttribute('href', `/pt/comunidades/${ob('cpraia')}/apelar?alvo=${ob('tfeira')}`)
  })
  it('apelação já aberta, mantida ou revertida mostra a situação e NÃO oferece apelar de novo', () => {
    for (const [situacao, texto] of [['aberta', /Apelação aberta/], ['mantida', /Apelação recusada/], ['revertida', /Apelação aceita/]] as const) {
      const { unmount } = render(<ListaRemovidos itens={[removido({ apelacao: situacao })]} d={ptd} lang="pt" agora={AGORA} />)
      expect(screen.getByText(texto)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
      unmount()
    }
  })
  it('numa página, ou pelo relé, não há caminho de apelar por aqui, e a tela diz isso', () => {
    const { unmount } = render(<ListaRemovidos itens={[removido({ escopo: 'pagina' })]} d={ptd} lang="pt" agora={AGORA} />)
    expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
    expect(screen.getByText(/não tem apelação por aqui/)).toBeInTheDocument()
    unmount()
    render(<ListaRemovidos itens={[removido({ escopo: 'rele', contexto: null, por: 'rele' })]} d={ptd} lang="pt" agora={AGORA} />)
    expect(screen.queryByRole('link', { name: 'Apelar' })).toBeNull()
  })
  it('depois do prazo o relé não guarda mais o texto, e a tela diz isso em vez de ficar em branco', () => {
    render(<ListaRemovidos itens={[removido({ trecho: null })]} d={ptd} lang="pt" agora={AGORA} />)
    expect(screen.getByText('O relé já não guarda o texto removido.')).toBeInTheDocument()
  })
  it('lista vazia: a seção existe e diz que nada foi removido', () => {
    render(<ListaRemovidos itens={[]} d={ptd} lang="pt" agora={AGORA} />)
    expect(screen.getByText('Nada do seu rover foi removido.')).toBeInTheDocument()
  })
  it('em inglês os textos vêm do dicionário em inglês', () => {
    render(<ListaRemovidos itens={[removido({ apelacao: 'mantida' })]} d={end} lang="en" agora={AGORA} />)
    expect(screen.getByText('In a community')).toBeInTheDocument()
    expect(screen.getByText(/Appeal denied/)).toBeInTheDocument()
  })
  it('o trecho removido com marcação não vira elemento', () => {
    render(<ListaRemovidos itens={[removido({ trecho: '<script>alert(1)</script> troca' })]} d={ptd} lang="pt" agora={AGORA} />)
    expect(document.querySelector('script')).toBeNull()
  })
})
