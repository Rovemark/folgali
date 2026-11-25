import { describe, expect, it } from 'vitest'
import type { Rascunho } from '@/lib/dominio/aprovacao'
import type { RascunhoSocial } from '@/lib/dominio/aprovacao-social'
import { caminhoDepoisDePublicar, montarFila } from '@/lib/dominio/fila-aprovacao'
import { idDeDemonstracao } from '@/lib/dominio/ids'

const rover = { uid: idDeDemonstracao('rvr', 'lumi'), handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff' } }
const texto = (id: string, criadoEm: string): Rascunho => ({ id, tipo: 'postagem', rover, texto: 'oi', topicos: [], criadoEm, versao: 1, estado: 'pendente' })
const social = (id: string, criadoEm: string, extra: Partial<RascunhoSocial> = {}): RascunhoSocial => ({ id, tipo: 'recado', rover, campos: {}, destino: null, criadoEm, versao: 1, estado: 'pendente', ...extra })
const C = idDeDemonstracao('ob', 'ccinema')
const T = idDeDemonstracao('ob', 'tcinemapipoca')
const G = idDeDemonstracao('ob', 'gnuvens')

describe('montarFila: uma fila só', () => {
  it('sem rascunho social, mantém a ordem recebida (mesmo fora de ordem de data)', () => {
    const f = montarFila([texto('b', '2026-11-04T12:00:00Z'), texto('a', '2026-11-04T10:00:00Z')], [])
    expect(f.map((x) => x.id)).toEqual(['b', 'a'])
    expect(f.every((x) => x.tipo === 'texto')).toBe(true)
  })
  it('com rascunho social, junta pela data: o que espera há mais tempo vem primeiro', () => {
    const f = montarFila([texto('t2', '2026-11-04T12:00:00Z')], [social('s1', '2026-11-04T09:00:00Z'), social('s3', '2026-11-04T13:00:00Z')])
    expect(f.map((x) => x.id)).toEqual(['s1', 't2', 's3'])
    expect(f.map((x) => x.tipo)).toEqual(['social', 'texto', 'social'])
  })
  it('data igual: o de texto fica antes do social (ordem estável)', () => {
    const f = montarFila([texto('t', '2026-11-04T10:00:00Z')], [social('s', '2026-11-04T10:00:00Z')])
    expect(f.map((x) => x.id)).toEqual(['t', 's'])
  })
  it('várias com a mesma data: a ordem de chegada se mantém (textos primeiro, depois os sociais na ordem recebida)', () => {
    const iguais = '2026-11-04T10:00:00Z'
    const f = montarFila([texto('t1', iguais), texto('t2', iguais)], [social('s1', iguais), social('s2', iguais), social('s3', iguais)])
    expect(f.map((x) => x.id)).toEqual(['t1', 't2', 's1', 's2', 's3'])
  })
  it('o item carrega a data e o rascunho de origem', () => {
    const t = texto('t', '2026-11-04T10:00:00Z')
    const s = social('s', '2026-11-04T11:00:00Z')
    const f = montarFila([t], [s])
    expect(f[0]).toEqual({ tipo: 'texto', id: 't', criadoEm: t.criadoEm, r: t })
    expect(f[1]).toEqual({ tipo: 'social', id: 's', criadoEm: s.criadoEm, r: s })
  })
  it('lista vazia dá fila vazia', () => {
    expect(montarFila([], [])).toEqual([])
  })
})

describe('caminhoDepoisDePublicar: para onde levar a pessoa', () => {
  const base = { rover, destino: null }
  it('comunidade, página e tópico criados vão para o objeto novo', () => {
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'comunidade-criar', campos: {} }, C)).toBe(`/comunidades/${C}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'pagina-criar', campos: {} }, G)).toBe(`/paginas/${G}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'topico', campos: {} }, T)).toBe(`/t/${T}`)
  })
  it('sem o id do objeto criado, não há para onde ir', () => {
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'comunidade-criar', campos: {} })).toBeNull()
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'pagina-criar', campos: {} })).toBeNull()
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'topico', campos: {} })).toBeNull()
  })
  it('mudanças, posse, edição, resposta e atualização vão para o lugar que o campo aponta', () => {
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'comunidade-atualizar', campos: { comunidade: C } })).toBe(`/comunidades/${C}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'comunidade-posse', campos: { comunidade: C } })).toBe(`/comunidades/${C}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'pagina-atualizar', campos: { pagina: G } })).toBe(`/paginas/${G}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'pagina-publicar', campos: { pagina: G } })).toBe(`/paginas/${G}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'topico-editar', campos: { topico: T } })).toBe(`/t/${T}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'resposta-forum', campos: { topico: T } })).toBe(`/t/${T}`)
  })
  it('campo de referência que não é texto (lista, número) ou é vazio: nenhum caminho', () => {
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'comunidade-atualizar', campos: { comunidade: '' } })).toBeNull()
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'comunidade-atualizar', campos: { comunidade: [C] } })).toBeNull()
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'comunidade-atualizar', campos: {} })).toBeNull()
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'pagina-publicar', campos: { pagina: [G] } })).toBeNull()
  })
  it('só tira o idioma do começo do endereço, inteiro, e nunca de dentro dele', () => {
    const r = (href: string) => caminhoDepoisDePublicar({ rover, tipo: 'recado', campos: {}, destino: { rotulo: 'x', href } })
    expect(r('/pt')).toBeNull()
    expect(r('/pt/r/pipa')).toBe('/r/pipa')
    expect(r('/r/pt/pipa')).toBe('/r/pt/pipa')
    expect(r('/pt-br/r/pipa')).toBe('/pt-br/r/pipa')
    expect(r('/ptolomeu')).toBe('/ptolomeu')
  })
  it('campo de referência vazio: nenhum caminho', () => {
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'pagina-publicar', campos: { pagina: null } })).toBeNull()
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'topico-editar', campos: { topico: '' } })).toBeNull()
  })
  it('apelação de banimento leva à comunidade; de remoção não tem para onde', () => {
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'apelacao', campos: { tipo: 'banimento', alvo: C } })).toBe(`/comunidades/${C}`)
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'apelacao', campos: { tipo: 'remocao', alvo: T } })).toBeNull()
  })
  it('entrega leva ao perfil do rover', () => {
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'entrega', campos: {} })).toBe('/r/lumi')
  })
  it('recado e depoimento usam o destino dito pelo rascunho, sem o idioma', () => {
    expect(caminhoDepoisDePublicar({ rover, tipo: 'recado', campos: {}, destino: { rotulo: 'mural de @pipa', href: '/pt/r/pipa' } })).toBe('/r/pipa')
    expect(caminhoDepoisDePublicar({ rover, tipo: 'depoimento', campos: {}, destino: { rotulo: 'perfil de @nina', href: '/en/r/nina' } })).toBe('/r/nina')
    expect(caminhoDepoisDePublicar({ rover, tipo: 'recado', campos: {}, destino: { rotulo: 'x' } })).toBeNull()
    expect(caminhoDepoisDePublicar({ ...base, tipo: 'recado', campos: {} })).toBeNull()
  })
})
