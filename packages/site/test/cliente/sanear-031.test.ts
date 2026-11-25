import { describe, expect, it } from 'vitest'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { ErroRede } from '@/lib/tipos'
import * as S from '@/lib/social/sanear-social'

// Os campos da 0.3.1 direto no saneamento, nos limites que o medidor de mutação apontou (zero, teto, vazio, tipo errado, texto com várias linhas).

const uid = (n: string) => idDeDemonstracao('rvr', n)
const ob = (n: string) => idDeDemonstracao('ob', n)
const T0 = 1_793_000_000
const retrato = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const resumo = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato })
const estranho = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return e instanceof ErroRede && e.codigo === 'indisponivel'
  }
  return false
}

describe('contagens aditivas: zero é zero, não é "ausente"', () => {
  const perfil = { ...resumo(), descricao: '', sobre: '', habilidades: [], interesses: [], recados: 'amigos', listado: true, estado: null, seguindo: 0, seguidores: 0 }
  const pagina = (contagens: Record<string, unknown>, voce: Record<string, unknown> | null = null) => S.paginaDoRover({ rover: perfil, selos: {}, contagens, voce })
  it('seguidores e seguindo 0 continuam 0; negativo, texto e lista somem; nulo é grafo escondido', () => {
    expect(pagina({ seguidores: 0, seguindo: 0 }).contagens).toMatchObject({ seguidores: 0, seguindo: 0 })
    expect(pagina({ seguidores: 7.9 }).contagens.seguidores).toBe(7)
    for (const ruim of [-1, '3', [1], Number.NaN, Number.POSITIVE_INFINITY, {}]) expect('seguidores' in pagina({ seguidores: ruim }).contagens).toBe(false)
    expect(pagina({ seguidores: null, seguindo: null }).contagens).toMatchObject({ seguidores: null, seguindo: null })
    expect('seguidores' in pagina({}).contagens).toBe(false)
  })
  it('amigoDesde e contaDesde: ausente some, nulo fica nulo, torto some, bom vira ISO', () => {
    const v = (extra: Record<string, unknown>) => S.paginaDoRover({ rover: perfil, selos: {}, contagens: {}, voce: { amigo: true, ...extra } }).voce!
    expect('amigoDesde' in v({})).toBe(false)
    expect(v({ amigoDesde: null, contaDesde: null })).toMatchObject({ amigoDesde: null, contaDesde: null })
    expect('amigoDesde' in v({ amigoDesde: 'ontem' })).toBe(false)
    expect('contaDesde' in v({ contaDesde: {} })).toBe(false)
    expect(v({ amigoDesde: T0, contaDesde: new Date(T0 * 1000).toISOString() })).toMatchObject({ amigoDesde: new Date(T0 * 1000).toISOString(), contaDesde: new Date(T0 * 1000).toISOString() })
  })
  it('selosQueDei: só selos de verdade, sem repetir, na ordem fixa; lista vazia é vazia; não-lista some', () => {
    const v = (selosQueDei: unknown) => S.paginaDoRover({ rover: perfil, selos: {}, contagens: {}, voce: { amigo: true, selosQueDei } }).voce!
    expect(v(['divertido', 'confiavel', 'confiavel', 'inventado', 3, null, 'rapido']).selosQueDei).toEqual(['confiavel', 'rapido', 'divertido'])
    expect(v([]).selosQueDei).toEqual([])
    expect(v(['inventado', 7]).selosQueDei).toEqual([])
    expect('selosQueDei' in v('confiavel')).toBe(false)
    expect('selosQueDei' in v({ 0: 'confiavel' })).toBe(false)
  })
})

describe('`pessoas` no em alta: de 0 a 1 milhão, só inteiro', () => {
  const cartaoCom = (extra: Record<string, unknown>) => S.comunidadeCartao({ id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], ...extra })
  it('0 e 1 milhão passam, 1 milhão e 1 não; fração, texto e negativo somem', () => {
    expect(cartaoCom({ pessoas: 0 }).pessoas).toBe(0)
    expect(cartaoCom({ pessoas: 1_000_000 }).pessoas).toBe(1_000_000)
    for (const ruim of [1_000_001, 1.5, '4', -1, null, [3]]) expect('pessoas' in cartaoCom({ pessoas: ruim })).toBe(false)
  })
  it('sem `pessoas` o cartão de comunidade, de página e de tópico fica sem a chave', () => {
    expect('pessoas' in cartaoCom({})).toBe(false)
    const pag = { id: ob('g1'), nome: 'Mapa', descricao: 'x', tema: 'arquivos', dono: resumo(), seguidores: 3, criadaEm: T0, atividadeEm: T0 }
    expect('pessoas' in S.paginaCartao(pag)).toBe(false)
    expect(S.paginaCartao({ ...pag, pessoas: 0 }).pessoas).toBe(0)
    const top = { id: ob('t1'), comunidade: ob('c1'), categoria: null, titulo: 'Oi', trecho: 'x', autor: resumo(), criadoEm: T0, atividadeEm: T0, respostas: 0, fixado: false, trancado: false, resolvido: false, tags: [], enquete: null, editado: false }
    expect('pessoas' in S.topicoCartao(top)).toBe(false)
    expect(S.topicoCartao({ ...top, pessoas: 0 }).pessoas).toBe(0)
  })
})

describe('`voce` na comunidade: papel', () => {
  const minima = (voce: unknown) => S.comunidade({ id: ob('c1'), nome: 'Oficina', descricao: 'x', acesso: 'fechada', voce }) as { voce: { papel: string | null; banido: boolean; membroDesde?: string | null; banidoEm?: string | null } }
  it('papel válido passa, nulo e ausente viram nulo, papel inventado derruba (fora do contrato)', () => {
    expect(minima({ papel: 'moderador' }).voce.papel).toBe('moderador')
    expect(minima({ papel: null }).voce.papel).toBeNull()
    expect(minima({}).voce.papel).toBeNull()
    expect(estranho(() => minima({ papel: 'rei' }))).toBe(true)
  })
  it('sem `voce` a comunidade mínima é fora do contrato; booleano torto é falso', () => {
    expect(estranho(() => minima(undefined))).toBe(true)
    expect(minima({ banido: 'sim' }).voce.banido).toBe(false)
    expect(minima({ banido: true, banidoEm: T0 }).voce.banidoEm).toBe(new Date(T0 * 1000).toISOString())
  })
})

describe('denúncia da fila: `topico`', () => {
  const den = (extra: Record<string, unknown>) => S.filaDeModeracao({ denuncias: [{ alvo: ob('r1'), alvoTipo: 'resposta-forum', total: 1, peso: 0, motivos: { spam: 1 }, primeiraEm: T0, ultimaEm: T0, ...extra }], apelacoes: [] }).denuncias[0]
  it('id válido vira o campo; nulo fica nulo; número, texto solto e lista somem', () => {
    expect(den({ topico: ob('t1') }).topico).toBe(ob('t1'))
    expect(den({ topico: null }).topico).toBeNull()
    for (const ruim of [5, 'lixo', [ob('t1')], {}, true]) expect('topico' in den({ topico: ruim })).toBe(false)
    expect('topico' in den({})).toBe(false)
  })
})

describe('registro: id, tipo do alvo, ação e apelação', () => {
  const reg = (extra: Record<string, unknown>) => S.registro({ id: 'reg1', em: T0, escopo: 'comunidade', contexto: ob('c1'), acao: 'remocao', alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'dono', apelacao: null, ...extra })
  it('o id fica só com letras, números, _ e -, até 80; vazio, grande demais e não-texto derrubam', () => {
    expect(reg({ id: 'a b!c<d>' }).id).toBe('abcd')
    expect(reg({ id: 'x'.repeat(80) }).id).toHaveLength(80)
    expect(estranho(() => reg({ id: 'x'.repeat(81) }))).toBe(true)
    expect(estranho(() => reg({ id: '' }))).toBe(true)
    expect(estranho(() => reg({ id: 12 }))).toBe(true)
    expect(reg({ id: 'a_b-9' }).id).toBe('a_b-9')
  })
  it('alvoTipo: só minúsculas e hífen, até 30 letras; não-texto vira nulo', () => {
    expect(reg({ alvoTipo: 'Resposta-Forum9' }).alvoTipo).toBe('esposta-orum')
    expect(reg({ alvoTipo: 'a'.repeat(40) }).alvoTipo).toHaveLength(30)
    expect(reg({ alvoTipo: null }).alvoTipo).toBeNull()
    expect(reg({ alvoTipo: 4 }).alvoTipo).toBeNull()
  })
  it('as quatro ações valem (a dispensa só com o motivo `dispensada`); outra ação derruba', () => {
    for (const acao of ['remocao', 'expulsao', 'banimento']) expect(reg({ acao }).acao).toBe(acao)
    expect(reg({ acao: 'dispensa', motivo: 'dispensada' }).acao).toBe('dispensa')
    expect(estranho(() => reg({ acao: 'dispensa', motivo: 'spam' }))).toBe(true)
    expect(estranho(() => reg({ acao: 'perdao' }))).toBe(true)
  })
  it('apelação: ausente e nula são nulas, as três situações passam, outra derruba', () => {
    expect(reg({ apelacao: undefined }).apelacao).toBeNull()
    expect(reg({ apelacao: null }).apelacao).toBeNull()
    for (const a of ['aberta', 'mantida', 'revertida']) expect(reg({ apelacao: a }).apelacao).toBe(a)
    expect(estranho(() => reg({ apelacao: 'quem sabe' }))).toBe(true)
  })
})

describe('removido: mesmas regras do registro e o trecho', () => {
  const item = (extra: Record<string, unknown> = {}) => ({
    id: 'rem1', em: T0, escopo: 'comunidade', contexto: ob('c1'), alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'dono', apelacao: null,
    envelope: { objeto: { id: ob('t1'), tipo: 'topico', autor: uid('pipa'), criadoEm: T0, corpo: { titulo: 'Troco canecas', texto: 'Quem quer?' } } }, ...extra,
  })
  const env = (corpo: Record<string, unknown>) => ({ objeto: { id: ob('t1'), tipo: 'topico', autor: uid('pipa'), criadoEm: T0, corpo } })
  it('id, tipo do alvo e apelação seguem as mesmas regras do registro', () => {
    expect(S.removido(item({ id: 'a b!c' })).id).toBe('abc')
    expect(S.removido(item({ id: 'x'.repeat(80) })).id).toHaveLength(80)
    expect(estranho(() => S.removido(item({ id: 'x'.repeat(81) })))).toBe(true)
    expect(estranho(() => S.removido(item({ id: '' })))).toBe(true)
    expect(estranho(() => S.removido(item({ id: 7 })))).toBe(true)
    expect(S.removido(item({ alvoTipo: 'Resposta-Forum9' })).alvoTipo).toBe('esposta-orum')
    expect(S.removido(item({ alvoTipo: 'a'.repeat(40) })).alvoTipo).toHaveLength(30)
    expect(S.removido(item({ alvoTipo: 3 })).alvoTipo).toBeNull()
    expect(S.removido(item({ apelacao: undefined })).apelacao).toBeNull()
    expect(S.removido(item({ apelacao: 'aberta' })).apelacao).toBe('aberta')
    expect(estranho(() => S.removido(item({ apelacao: 'talvez' })))).toBe(true)
  })
  it('o trecho junta título e texto; só com texto ou só com título, sem sobra de linha; tipo torto vira vazio, não "5"', () => {
    expect(S.removido(item()).trecho).toBe('Troco canecas\nQuem quer?')
    expect(S.removido(item({ envelope: env({ texto: 'só o texto' }) })).trecho).toBe('só o texto')
    expect(S.removido(item({ envelope: env({ titulo: 'só o título' }) })).trecho).toBe('só o título')
    expect(S.removido(item({ envelope: env({ titulo: 5, texto: 'ok' }) })).trecho).toBe('ok')
    expect(S.removido(item({ envelope: env({ titulo: 'ok', texto: { a: 1 } }) })).trecho).toBe('ok')
    expect(S.removido(item({ envelope: env({ titulo: 5, texto: 6 }) })).trecho).toBeNull()
    expect(S.removido(item({ envelope: env({}) })).trecho).toBeNull()
    expect(S.removido(item({ envelope: null })).trecho).toBeNull()
  })
  it('o trecho é cortado em 400 caracteres e não carrega marcação invisível', () => {
    const t = S.removido(item({ envelope: env({ texto: 'a'.repeat(900) }) })).trecho!
    expect(t.length).toBeLessThanOrEqual(400)
    expect(t.length).toBeGreaterThan(300)
  })
})

describe('depoimento enviado: o texto guarda os parágrafos', () => {
  it('quebras de linha ficam (texto de várias linhas), e o estado é sempre pendente', () => {
    const e = { objeto: { id: ob('d1'), tipo: 'depoimento', autor: uid('lumi'), criadoEm: T0, corpo: { texto: 'Primeira linha.\n\nSegunda linha.' } } }
    const d = S.depoimentoEnviado({ envelope: e, alvo: resumo('nina'), estado: 'pendente' })
    expect(d.texto).toBe('Primeira linha.\n\nSegunda linha.')
    expect(d.estado).toBe('pendente')
    expect(d.alvo.handle).toBe('nina')
  })
})
