import { describe, expect, it } from 'vitest'
import type { Draft } from '@/lib/domain/approval'
import type { SocialDraft } from '@/lib/domain/social-approval'
import { pathAfterPublish, buildQueue } from '@/lib/domain/approval-queue'
import { demoId } from '@/lib/domain/ids'

const rover = { uid: demoId('rvr', 'lumi'), handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff' } }
const text = (id: string, createdAt: string): Draft => ({ id, tipo: 'postagem', rover, texto: 'oi', topicos: [], criadoEm: createdAt, versao: 1, estado: 'pendente' })
const social = (id: string, createdAt: string, extra: Partial<SocialDraft> = {}): SocialDraft => ({ id, tipo: 'recado', rover, campos: {}, destino: null, criadoEm: createdAt, versao: 1, estado: 'pendente', ...extra })
const C = demoId('ob', 'ccinema')
const T = demoId('ob', 'tcinemapipoca')
const G = demoId('ob', 'gnuvens')

describe('buildQueue: a single queue', () => {
  it('without a social draft, keeps the received order (even if out of date order)', () => {
    const f = buildQueue([text('b', '2026-11-04T12:00:00Z'), text('a', '2026-11-04T10:00:00Z')], [])
    expect(f.map((x) => x.id)).toEqual(['b', 'a'])
    expect(f.every((x) => x.tipo === 'texto')).toBe(true)
  })
  it('with a social draft, merges by date: what has waited longest comes first', () => {
    const f = buildQueue([text('t2', '2026-11-04T12:00:00Z')], [social('s1', '2026-11-04T09:00:00Z'), social('s3', '2026-11-04T13:00:00Z')])
    expect(f.map((x) => x.id)).toEqual(['s1', 't2', 's3'])
    expect(f.map((x) => x.tipo)).toEqual(['social', 'texto', 'social'])
  })
  it('equal date: the text one comes before the social one (stable order)', () => {
    const f = buildQueue([text('t', '2026-11-04T10:00:00Z')], [social('s', '2026-11-04T10:00:00Z')])
    expect(f.map((x) => x.id)).toEqual(['t', 's'])
  })
  it('several with the same date: the arrival order is kept (texts first, then the social ones in received order)', () => {
    const equal = '2026-11-04T10:00:00Z'
    const f = buildQueue([text('t1', equal), text('t2', equal)], [social('s1', equal), social('s2', equal), social('s3', equal)])
    expect(f.map((x) => x.id)).toEqual(['t1', 't2', 's1', 's2', 's3'])
  })
  it('the item carries the date and the source draft', () => {
    const t = text('t', '2026-11-04T10:00:00Z')
    const s = social('s', '2026-11-04T11:00:00Z')
    const f = buildQueue([t], [s])
    expect(f[0]).toEqual({ tipo: 'texto', id: 't', criadoEm: t.criadoEm, r: t })
    expect(f[1]).toEqual({ tipo: 'social', id: 's', criadoEm: s.criadoEm, r: s })
  })
  it('an empty list gives an empty queue', () => {
    expect(buildQueue([], [])).toEqual([])
  })
})

describe('pathAfterPublish: where to take the person', () => {
  const base = { rover, destino: null }
  it('a created community, page and topic go to the new object', () => {
    expect(pathAfterPublish({ ...base, tipo: 'comunidade-criar', campos: {} }, C)).toBe(`/comunidades/${C}`)
    expect(pathAfterPublish({ ...base, tipo: 'pagina-criar', campos: {} }, G)).toBe(`/paginas/${G}`)
    expect(pathAfterPublish({ ...base, tipo: 'topico', campos: {} }, T)).toBe(`/t/${T}`)
  })
  it('without the created object\'s id, there is nowhere to go', () => {
    expect(pathAfterPublish({ ...base, tipo: 'comunidade-criar', campos: {} })).toBeNull()
    expect(pathAfterPublish({ ...base, tipo: 'pagina-criar', campos: {} })).toBeNull()
    expect(pathAfterPublish({ ...base, tipo: 'topico', campos: {} })).toBeNull()
  })
  it('changes, ownership, edit, reply and update go to the place the field points to', () => {
    expect(pathAfterPublish({ ...base, tipo: 'comunidade-atualizar', campos: { comunidade: C } })).toBe(`/comunidades/${C}`)
    expect(pathAfterPublish({ ...base, tipo: 'comunidade-posse', campos: { comunidade: C } })).toBe(`/comunidades/${C}`)
    expect(pathAfterPublish({ ...base, tipo: 'pagina-atualizar', campos: { pagina: G } })).toBe(`/paginas/${G}`)
    expect(pathAfterPublish({ ...base, tipo: 'pagina-publicar', campos: { pagina: G } })).toBe(`/paginas/${G}`)
    expect(pathAfterPublish({ ...base, tipo: 'topico-editar', campos: { topico: T } })).toBe(`/t/${T}`)
    expect(pathAfterPublish({ ...base, tipo: 'resposta-forum', campos: { topico: T } })).toBe(`/t/${T}`)
  })
  it('a reference field that is not text (list, number) or is empty: no path', () => {
    expect(pathAfterPublish({ ...base, tipo: 'comunidade-atualizar', campos: { comunidade: '' } })).toBeNull()
    expect(pathAfterPublish({ ...base, tipo: 'comunidade-atualizar', campos: { comunidade: [C] } })).toBeNull()
    expect(pathAfterPublish({ ...base, tipo: 'comunidade-atualizar', campos: {} })).toBeNull()
    expect(pathAfterPublish({ ...base, tipo: 'pagina-publicar', campos: { pagina: [G] } })).toBeNull()
  })
  it('only removes the language from the start of the address, whole, and never from inside it', () => {
    const r = (href: string) => pathAfterPublish({ rover, tipo: 'recado', campos: {}, destino: { rotulo: 'x', href } })
    expect(r('/pt')).toBeNull()
    expect(r('/pt/r/pipa')).toBe('/r/pipa')
    expect(r('/r/pt/pipa')).toBe('/r/pt/pipa')
    expect(r('/pt-br/r/pipa')).toBe('/pt-br/r/pipa')
    expect(r('/ptolomeu')).toBe('/ptolomeu')
  })
  it('an empty reference field: no path', () => {
    expect(pathAfterPublish({ ...base, tipo: 'pagina-publicar', campos: { pagina: null } })).toBeNull()
    expect(pathAfterPublish({ ...base, tipo: 'topico-editar', campos: { topico: '' } })).toBeNull()
  })
  it('a ban appeal leads to the community; a removal one has nowhere to go', () => {
    expect(pathAfterPublish({ ...base, tipo: 'apelacao', campos: { tipo: 'banimento', alvo: C } })).toBe(`/comunidades/${C}`)
    expect(pathAfterPublish({ ...base, tipo: 'apelacao', campos: { tipo: 'remocao', alvo: T } })).toBeNull()
  })
  it('a delivery leads to the rover\'s profile', () => {
    expect(pathAfterPublish({ ...base, tipo: 'entrega', campos: {} })).toBe('/r/lumi')
  })
  it('note and testimonial use the destination the draft states, without the language', () => {
    expect(pathAfterPublish({ rover, tipo: 'recado', campos: {}, destino: { rotulo: 'mural de @pipa', href: '/pt/r/pipa' } })).toBe('/r/pipa')
    expect(pathAfterPublish({ rover, tipo: 'depoimento', campos: {}, destino: { rotulo: 'perfil de @nina', href: '/en/r/nina' } })).toBe('/r/nina')
    expect(pathAfterPublish({ rover, tipo: 'recado', campos: {}, destino: { rotulo: 'x' } })).toBeNull()
    expect(pathAfterPublish({ ...base, tipo: 'recado', campos: {} })).toBeNull()
  })
})
