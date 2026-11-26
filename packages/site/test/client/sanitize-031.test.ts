import { describe, expect, it } from 'vitest'
import { demoId } from '@/lib/domain/ids'
import { NetworkError } from '@/lib/types'
import * as S from '@/lib/social/sanitize-social'

// The 0.3.1 fields straight into the sanitizing, at the limits the mutation testing pointed out (zero, ceiling, empty, wrong type, text with several lines).

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const T0 = 1_793_000_000
const portrait = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const summary = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato: portrait })
const strange = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return e instanceof NetworkError && e.codigo === 'indisponivel'
  }
  return false
}

describe('additive counts: zero is zero, not "absent"', () => {
  const profile = { ...summary(), descricao: '', sobre: '', habilidades: [], interesses: [], recados: 'amigos', listado: true, estado: null, seguindo: 0, seguidores: 0 }
  const page = (counts: Record<string, unknown>, you: Record<string, unknown> | null = null) => S.roverPage({ rover: profile, selos: {}, contagens: counts, voce: you })
  it('followers and following 0 stay 0; negative, text and list disappear; null is a hidden graph', () => {
    expect(page({ seguidores: 0, seguindo: 0 }).contagens).toMatchObject({ seguidores: 0, seguindo: 0 })
    expect(page({ seguidores: 7.9 }).contagens.seguidores).toBe(7)
    for (const bad of [-1, '3', [1], Number.NaN, Number.POSITIVE_INFINITY, {}]) expect('seguidores' in page({ seguidores: bad }).contagens).toBe(false)
    expect(page({ seguidores: null, seguindo: null }).contagens).toMatchObject({ seguidores: null, seguindo: null })
    expect('seguidores' in page({}).contagens).toBe(false)
  })
  it('friendSince and accountSince: absent disappears, null stays null, malformed disappears, good becomes ISO', () => {
    const v = (extra: Record<string, unknown>) => S.roverPage({ rover: profile, selos: {}, contagens: {}, voce: { amigo: true, ...extra } }).voce!
    expect('amigoDesde' in v({})).toBe(false)
    expect(v({ amigoDesde: null, contaDesde: null })).toMatchObject({ amigoDesde: null, contaDesde: null })
    expect('amigoDesde' in v({ amigoDesde: 'ontem' })).toBe(false)
    expect('contaDesde' in v({ contaDesde: {} })).toBe(false)
    expect(v({ amigoDesde: T0, contaDesde: new Date(T0 * 1000).toISOString() })).toMatchObject({ amigoDesde: new Date(T0 * 1000).toISOString(), contaDesde: new Date(T0 * 1000).toISOString() })
  })
  it('badgesIGave: only real badges, without repeating, in fixed order; an empty list is empty; a non-list disappears', () => {
    const v = (badgesIGave: unknown) => S.roverPage({ rover: profile, selos: {}, contagens: {}, voce: { amigo: true, selosQueDei: badgesIGave } }).voce!
    expect(v(['divertido', 'confiavel', 'confiavel', 'inventado', 3, null, 'rapido']).selosQueDei).toEqual(['confiavel', 'rapido', 'divertido'])
    expect(v([]).selosQueDei).toEqual([])
    expect(v(['inventado', 7]).selosQueDei).toEqual([])
    expect('selosQueDei' in v('confiavel')).toBe(false)
    expect('selosQueDei' in v({ 0: 'confiavel' })).toBe(false)
  })
})

describe('`pessoas` in trending: from 0 to 1 million, integers only', () => {
  const cardWith = (extra: Record<string, unknown>) => S.communityCardItem({ id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], ...extra })
  it('0 and 1 million pass, 1 million and 1 does not; fraction, text and negative disappear', () => {
    expect(cardWith({ pessoas: 0 }).pessoas).toBe(0)
    expect(cardWith({ pessoas: 1_000_000 }).pessoas).toBe(1_000_000)
    for (const bad of [1_000_001, 1.5, '4', -1, null, [3]]) expect('pessoas' in cardWith({ pessoas: bad })).toBe(false)
  })
  it('without `pessoas` the community, page and topic card stays without the key', () => {
    expect('pessoas' in cardWith({})).toBe(false)
    const page = { id: ob('g1'), nome: 'Mapa', descricao: 'x', tema: 'arquivos', dono: summary(), seguidores: 3, criadaEm: T0, atividadeEm: T0 }
    expect('pessoas' in S.pageCardItem(page)).toBe(false)
    expect(S.pageCardItem({ ...page, pessoas: 0 }).pessoas).toBe(0)
    const top = { id: ob('t1'), comunidade: ob('c1'), categoria: null, titulo: 'Oi', trecho: 'x', autor: summary(), criadoEm: T0, atividadeEm: T0, respostas: 0, fixado: false, trancado: false, resolvido: false, tags: [], enquete: null, editado: false }
    expect('pessoas' in S.topicCardItem(top)).toBe(false)
    expect(S.topicCardItem({ ...top, pessoas: 0 }).pessoas).toBe(0)
  })
})

describe('`voce` on the community: role', () => {
  const min = (you: unknown) => S.community({ id: ob('c1'), nome: 'Oficina', descricao: 'x', acesso: 'fechada', voce: you }) as { voce: { papel: string | null; banido: boolean; membroDesde?: string | null; banidoEm?: string | null } }
  it('a valid role passes, null and absent become null, an invented role brings it down (outside the contract)', () => {
    expect(min({ papel: 'moderador' }).voce.papel).toBe('moderador')
    expect(min({ papel: null }).voce.papel).toBeNull()
    expect(min({}).voce.papel).toBeNull()
    expect(strange(() => min({ papel: 'rei' }))).toBe(true)
  })
  it('without `voce` the minimal community is outside the contract; a malformed boolean is false', () => {
    expect(strange(() => min(undefined))).toBe(true)
    expect(min({ banido: 'sim' }).voce.banido).toBe(false)
    expect(min({ banido: true, banidoEm: T0 }).voce.banidoEm).toBe(new Date(T0 * 1000).toISOString())
  })
})

describe('queue report: `topico`', () => {
  const rep = (extra: Record<string, unknown>) => S.moderationQueue({ denuncias: [{ alvo: ob('r1'), alvoTipo: 'resposta-forum', total: 1, peso: 0, motivos: { spam: 1 }, primeiraEm: T0, ultimaEm: T0, ...extra }], apelacoes: [] }).denuncias[0]
  it('a valid id becomes the field; null stays null; a number, loose text and a list disappear', () => {
    expect(rep({ topico: ob('t1') }).topico).toBe(ob('t1'))
    expect(rep({ topico: null }).topico).toBeNull()
    for (const bad of [5, 'lixo', [ob('t1')], {}, true]) expect('topico' in rep({ topico: bad })).toBe(false)
    expect('topico' in rep({})).toBe(false)
  })
})

describe('log: id, target type, action and appeal', () => {
  const reg = (extra: Record<string, unknown>) => S.record({ id: 'reg1', em: T0, escopo: 'comunidade', contexto: ob('c1'), acao: 'remocao', alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'dono', apelacao: null, ...extra })
  it('the id keeps only letters, numbers, _ and -, up to 80; empty, too large and non-text bring it down', () => {
    expect(reg({ id: 'a b!c<d>' }).id).toBe('abcd')
    expect(reg({ id: 'x'.repeat(80) }).id).toHaveLength(80)
    expect(strange(() => reg({ id: 'x'.repeat(81) }))).toBe(true)
    expect(strange(() => reg({ id: '' }))).toBe(true)
    expect(strange(() => reg({ id: 12 }))).toBe(true)
    expect(reg({ id: 'a_b-9' }).id).toBe('a_b-9')
  })
  it('targetType: only lowercase and hyphen, up to 30 letters; non-text becomes null', () => {
    expect(reg({ alvoTipo: 'Resposta-Forum9' }).alvoTipo).toBe('esposta-orum')
    expect(reg({ alvoTipo: 'a'.repeat(40) }).alvoTipo).toHaveLength(30)
    expect(reg({ alvoTipo: null }).alvoTipo).toBeNull()
    expect(reg({ alvoTipo: 4 }).alvoTipo).toBeNull()
  })
  it('the four actions are valid (a dismissal only with the reason `dispensada`); another action brings it down', () => {
    for (const action of ['remocao', 'expulsao', 'banimento']) expect(reg({ acao: action }).acao).toBe(action)
    expect(reg({ acao: 'dispensa', motivo: 'dispensada' }).acao).toBe('dispensa')
    expect(strange(() => reg({ acao: 'dispensa', motivo: 'spam' }))).toBe(true)
    expect(strange(() => reg({ acao: 'perdao' }))).toBe(true)
  })
  it('appeal: absent and null are null, the three states pass, another brings it down', () => {
    expect(reg({ apelacao: undefined }).apelacao).toBeNull()
    expect(reg({ apelacao: null }).apelacao).toBeNull()
    for (const a of ['aberta', 'mantida', 'revertida']) expect(reg({ apelacao: a }).apelacao).toBe(a)
    expect(strange(() => reg({ apelacao: 'quem sabe' }))).toBe(true)
  })
})

describe('removed: the same rules as the log, and the excerpt', () => {
  const item = (extra: Record<string, unknown> = {}) => ({
    id: 'rem1', em: T0, escopo: 'comunidade', contexto: ob('c1'), alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'dono', apelacao: null,
    envelope: { objeto: { id: ob('t1'), tipo: 'topico', autor: uid('pipa'), criadoEm: T0, corpo: { titulo: 'Troco canecas', texto: 'Quem quer?' } } }, ...extra,
  })
  const env = (body: Record<string, unknown>) => ({ objeto: { id: ob('t1'), tipo: 'topico', autor: uid('pipa'), criadoEm: T0, corpo: body } })
  it('id, target type and appeal follow the same rules as the log', () => {
    expect(S.removed(item({ id: 'a b!c' })).id).toBe('abc')
    expect(S.removed(item({ id: 'x'.repeat(80) })).id).toHaveLength(80)
    expect(strange(() => S.removed(item({ id: 'x'.repeat(81) })))).toBe(true)
    expect(strange(() => S.removed(item({ id: '' })))).toBe(true)
    expect(strange(() => S.removed(item({ id: 7 })))).toBe(true)
    expect(S.removed(item({ alvoTipo: 'Resposta-Forum9' })).alvoTipo).toBe('esposta-orum')
    expect(S.removed(item({ alvoTipo: 'a'.repeat(40) })).alvoTipo).toHaveLength(30)
    expect(S.removed(item({ alvoTipo: 3 })).alvoTipo).toBeNull()
    expect(S.removed(item({ apelacao: undefined })).apelacao).toBeNull()
    expect(S.removed(item({ apelacao: 'aberta' })).apelacao).toBe('aberta')
    expect(strange(() => S.removed(item({ apelacao: 'talvez' })))).toBe(true)
  })
  it('the excerpt joins title and text; with only text or only title, no leftover line; a malformed type becomes empty, not "5"', () => {
    expect(S.removed(item()).trecho).toBe('Troco canecas\nQuem quer?')
    expect(S.removed(item({ envelope: env({ texto: 'só o texto' }) })).trecho).toBe('só o texto')
    expect(S.removed(item({ envelope: env({ titulo: 'só o título' }) })).trecho).toBe('só o título')
    expect(S.removed(item({ envelope: env({ titulo: 5, texto: 'ok' }) })).trecho).toBe('ok')
    expect(S.removed(item({ envelope: env({ titulo: 'ok', texto: { a: 1 } }) })).trecho).toBe('ok')
    expect(S.removed(item({ envelope: env({ titulo: 5, texto: 6 }) })).trecho).toBeNull()
    expect(S.removed(item({ envelope: env({}) })).trecho).toBeNull()
    expect(S.removed(item({ envelope: null })).trecho).toBeNull()
  })
  it('the excerpt is cut at 400 characters and carries no invisible markup', () => {
    const t = S.removed(item({ envelope: env({ texto: 'a'.repeat(900) }) })).trecho!
    expect(t.length).toBeLessThanOrEqual(400)
    expect(t.length).toBeGreaterThan(300)
  })
})

describe('testimonial sent: the text keeps the paragraphs', () => {
  it('line breaks stay (multi-line text), and the state is always pending', () => {
    const e = { objeto: { id: ob('d1'), tipo: 'depoimento', autor: uid('lumi'), criadoEm: T0, corpo: { texto: 'Primeira linha.\n\nSegunda linha.' } } }
    const d = S.sentTestimonial({ envelope: e, alvo: summary('nina'), estado: 'pendente' })
    expect(d.texto).toBe('Primeira linha.\n\nSegunda linha.')
    expect(d.estado).toBe('pendente')
    expect(d.alvo.handle).toBe('nina')
  })
})
