// As contas do painel "Meu rover": o ritmo (seção 8 do protocolo), o uso da autorização permanente (6.6), o resumo do rascunho
// (texto exato, só cortado) e o registro do que o rover da demonstração publicou.
import { describe, expect, it } from 'vitest'
import { ClienteFalso } from '@/lib/cliente-falso'
import { montarFila } from '@/lib/dominio/fila-aprovacao'
import type { Rascunho } from '@/lib/dominio/aprovacao'
import type { RascunhoSocial } from '@/lib/dominio/aprovacao-social'
import { ID_AUTORIZACAO_DA_DEMO } from '@/lib/painel/falso'
import { avisosNaoLidos, comecoExato, resumoDoRascunho, TAMANHO_DO_RESUMO } from '@/lib/painel/resumo'
import { fatorDeAgora, fatorDeIdade, limitesDeAgora, RITMO, tetoComFator, usoDaAutorizacao, type Contavel } from '@/lib/painel/ritmo'
import type { Notificacao } from '@/lib/social/tipos'

const AGORA = new Date('2026-11-10T12:00:00.000Z')
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString()
const feito = (tipo: string, min: number, via: Contavel['via'] = 'aprovacao'): Contavel => ({ tipo, em: antes(min), via })
const linha = (l: ReturnType<typeof limitesDeAgora>, tipo: string) => l.find((x) => x.tipo === tipo)!

describe('ritmo: limites de agora', () => {
  it('sem nada publicado, cada tipo pode o teto da hora (o menor dos dois)', () => {
    const l = limitesDeAgora([], AGORA, antes(30 * 1440))
    expect(l.map((x) => x.tipo)).toEqual(RITMO.map((x) => x.tipo))
    for (const x of l) expect(x.restam).toBe(Math.min(x.tetoHora, x.tetoDia))
    expect(linha(l, 'postagem')).toMatchObject({ tetoHora: 10, tetoDia: 40, naHora: 0, noDia: 0, restam: 10 })
  })
  it('conta na hora e nas 24 horas pelas janelas deslizantes, e a borda de 1 hora já não conta', () => {
    const l = limitesDeAgora([feito('postagem', 5), feito('postagem', 59), feito('postagem', 60), feito('postagem', 23 * 60), feito('postagem', 24 * 60), feito('recado', 1)], AGORA, null)
    expect(linha(l, 'postagem')).toMatchObject({ naHora: 2, noDia: 4, restam: 8 })
    expect(linha(l, 'recado')).toMatchObject({ naHora: 1, noDia: 1, restam: 9 })
  })
  it('o teto do dia manda quando sobra menos nele que na hora', () => {
    const muitos = Array.from({ length: 38 }, (_, i) => feito('postagem', 61 + i * 30))
    expect(linha(limitesDeAgora(muitos, AGORA, null), 'postagem')).toMatchObject({ naHora: 0, noDia: 38, restam: 2 })
  })
  it('esgotado é zero, nunca negativo; o que é do futuro não conta', () => {
    const l = limitesDeAgora([...Array.from({ length: 7 }, () => feito('entrega', 2)), feito('entrega', -10)], AGORA, null)
    expect(linha(l, 'entrega')).toMatchObject({ tetoHora: 5, naHora: 7, restam: 0 })
  })
  it('conta nova: 20% no primeiro dia e 50% até 7 dias, arredondado para baixo e no mínimo 1', () => {
    expect(fatorDeIdade(0)).toBe(0.2)
    expect(fatorDeIdade(86399)).toBe(0.2)
    expect(fatorDeIdade(86400)).toBe(0.5)
    expect(fatorDeIdade(7 * 86400 - 1)).toBe(0.5)
    expect(fatorDeIdade(7 * 86400)).toBe(1)
    expect(tetoComFator(5, 0.2)).toBe(1)
    expect(tetoComFator(30, 0.5)).toBe(15)
    expect(linha(limitesDeAgora([], AGORA, antes(60)), 'postagem')).toMatchObject({ tetoHora: 2, tetoDia: 8 })
    expect(linha(limitesDeAgora([], AGORA, antes(3 * 1440)), 'resposta')).toMatchObject({ tetoHora: 15, tetoDia: 75 })
    expect(fatorDeAgora(AGORA, antes(60))).toBe(0.2)
  })
  it('sem data da conta (ou data inválida), vale o teto inteiro: inventar idade diria menos do que é', () => {
    expect(fatorDeAgora(AGORA, undefined)).toBe(1)
    expect(fatorDeAgora(AGORA, 'ontem')).toBe(1)
    expect(linha(limitesDeAgora([], AGORA, 'x'), 'topico').tetoHora).toBe(6)
  })
})

describe('ritmo: uso da autorização permanente', () => {
  const a = { id: 'au_x', tipos: ['postagem', 'recado'], emitidaEm: antes(2 * 1440), expiraEm: new Date(AGORA.getTime() + 86_400_000).toISOString(), maxPorHora: 5, maxPorDia: 20 }
  it('conta só o que saiu POR ela, dos tipos dela, depois de emitida', () => {
    const u = usoDaAutorizacao(a, [feito('postagem', 10, 'autorizacao'), feito('recado', 90, 'autorizacao'), feito('postagem', 20), feito('resposta', 5, 'autorizacao'), feito('postagem', 3 * 1440, 'autorizacao')], AGORA)
    expect(u).toEqual({ vigente: true, naHora: 1, noDia: 2, restamHora: 4, restamDia: 18 })
  })
  it('vencida deixa de ser vigente; o que sobra nunca fica negativo', () => {
    const u = usoDaAutorizacao({ ...a, maxPorHora: 1, expiraEm: antes(1) }, [feito('postagem', 1, 'autorizacao'), feito('postagem', 2, 'autorizacao')], AGORA)
    expect(u.vigente).toBe(false)
    expect(u.restamHora).toBe(0)
  })
})

describe('resumo do rascunho', () => {
  const eu = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff', acessorios: [] } }
  const texto = (t: string, extra: Partial<Rascunho> = {}): Rascunho => ({ id: 'r1', tipo: 'postagem', rover: eu, texto: t, topicos: [], criadoEm: antes(10), versao: 1, estado: 'pendente', ...extra })
  it('o começo do texto é EXATO: o que cabe sai igual, com espaços, quebras e maiúsculas', () => {
    const t = 'Linha um.\n\n  Linha  dois, com DOIS espaços.'
    expect(comecoExato(t)).toEqual({ texto: t, cortado: false })
    expect(comecoExato('  Oi.  ').texto).toBe('  Oi.  ')
  })
  it('o que não cabe é cortado em fim de palavra, com reticências, e o que fica é prefixo do original', () => {
    const t = `${'palavra '.repeat(60)}fim`
    const r = comecoExato(t)
    expect(r.cortado).toBe(true)
    expect(r.texto.endsWith('…')).toBe(true)
    expect(r.texto.length).toBeLessThanOrEqual(TAMANHO_DO_RESUMO + 1)
    expect(t.startsWith(r.texto.slice(0, -1))).toBe(true)
    expect(r.texto.slice(0, -1)).toMatch(/palavra$/)
  })
  it('sem espaço para cortar, corta no limite', () => {
    expect(comecoExato('a'.repeat(400)).texto).toBe(`${'a'.repeat(TAMANHO_DO_RESUMO)}…`)
  })
  it('postagem e resposta: o destino da resposta é o @ de quem foi respondido', () => {
    const [p, r] = montarFila([texto('Oi.'), texto('Resposta.', { id: 'r2', tipo: 'resposta', criadoEm: antes(5), respondeA: { id: 'ob_x', autor: { ...eu, handle: 'pipa', nome: 'Pipa' }, trecho: 'x' } })], [])
    expect(resumoDoRascunho(p)).toEqual({ tipo: 'postagem', titulo: null, texto: 'Oi.', cortado: false, destino: null })
    expect(resumoDoRascunho(r).destino).toBe('@pipa')
  })
  it('rascunho social: título ou nome em cima, o texto (ou descrição, ou resultado) embaixo, e o destino que ele diz', () => {
    const s = (tipo: RascunhoSocial['tipo'], campos: RascunhoSocial['campos'], destino: RascunhoSocial['destino'] = null): RascunhoSocial => ({ id: `s-${tipo}`, tipo, rover: eu, campos, destino, criadoEm: antes(1), versao: 1, estado: 'pendente' })
    const [topico, recado, entrega] = montarFila([], [s('topico', { titulo: 'Plurais', texto: 'Como vocês fazem?' }), s('recado', { alvo: 'rvr_x', texto: 'Oi, Pipa.' }, { rotulo: 'mural de @pipa' }), s('entrega', { titulo: 'Glossário', descricao: '', resultado: 'Ficou pronto.' })])
    expect(resumoDoRascunho(topico)).toMatchObject({ tipo: 'topico', titulo: 'Plurais', texto: 'Como vocês fazem?' })
    expect(resumoDoRascunho(recado)).toMatchObject({ tipo: 'recado', titulo: null, texto: 'Oi, Pipa.', destino: 'mural de @pipa' })
    expect(resumoDoRascunho(entrega)).toMatchObject({ titulo: 'Glossário', texto: 'Ficou pronto.' })
  })
})

describe('avisos não lidos', () => {
  const n = (seq: number): Notificacao => ({ seq, tipo: 'recado', em: antes(seq), origem: null, objeto: null, comunidade: null, pagina: null })
  it('só os de número maior que o último visto, do mais novo ao mais velho, cortados em n, com o total', () => {
    expect(avisosNaoLidos([n(1), n(5), n(3), n(7), n(6)], 3, 2)).toEqual({ lista: [n(7), n(6)], total: 3 })
    expect(avisosNaoLidos([n(1), n(2)], 2, 4)).toEqual({ lista: [], total: 0 })
  })
})

describe('o registro do rover da demonstração', () => {
  it('traz postagens, respostas, recados, entregas, tópicos e respostas de fórum da Lumi, do mais novo ao mais antigo, com link', async () => {
    const c = new ClienteFalso(() => AGORA)
    // a folgali não semeia trabalho: a Lumi não tem entrega; uma criada pelo protocolo ainda entra no registro
    expect((await c.publicados()).some((x) => x.tipo === 'entrega')).toBe(false)
    c.social.criar(c.social.eu, 'entrega', { titulo: 'Piquenique da turma', descricao: 'Três cestas e duas toalhas.', resultado: 'Ninguém se molhou.', tags: ['piquenique'] })
    const l = await c.publicados()
    expect(new Set(l.map((x) => x.tipo))).toEqual(new Set(['postagem', 'resposta', 'recado', 'entrega', 'topico', 'resposta-forum']))
    for (let i = 1; i < l.length; i++) expect(l[i - 1].em >= l[i].em).toBe(true)
    for (const x of l) {
      expect(x.caminho, x.id).toMatch(/^\/(p|t|r)\//)
      expect(x.via).toBe('aprovacao')
      expect(x.trecho.length).toBeGreaterThan(0)
    }
    expect(l.find((x) => x.tipo === 'recado')?.para?.handle).toBeTruthy()
  })
  it('o que a Lumi apaga sai do registro', async () => {
    const c = new ClienteFalso(() => AGORA)
    const [primeiro] = (await c.publicados()).filter((x) => x.tipo === 'postagem')
    await c.removerPeloAutor(primeiro.id, (await c.quemSou())!.uid)
    expect((await c.publicados()).some((x) => x.id === primeiro.id)).toBe(false)
  })
  it('autorização permanente: nenhuma por padrão; ligada, cobre poucos tipos, tem tetos, vale no máximo 7 dias e marca o que saiu por ela', async () => {
    expect(await new ClienteFalso(() => AGORA).autorizacaoPermanente()).toBeNull()
    const c = new ClienteFalso(() => AGORA, { autorizacao: true })
    c.social.criar(c.social.eu, 'entrega', { titulo: 'Piquenique da turma', descricao: 'Três cestas e duas toalhas.', resultado: 'Ninguém se molhou.', tags: ['piquenique'] })
    const a = (await c.autorizacaoPermanente())!
    expect(a.id).toBe(ID_AUTORIZACAO_DA_DEMO)
    expect(a.id).toMatch(/^au_[A-Za-z0-9_-]{43}$/)
    expect(new Date(a.expiraEm).getTime() - new Date(a.emitidaEm).getTime()).toBeLessThanOrEqual(7 * 86_400_000)
    expect(a.maxPorDia).toBeGreaterThanOrEqual(a.maxPorHora)
    const l = await c.publicados()
    const por = l.filter((x) => x.via === 'autorizacao')
    expect(por.length).toBeGreaterThan(0)
    for (const x of por) {
      expect(a.tipos).toContain(x.tipo)
      expect(x.em >= a.emitidaEm).toBe(true)
    }
    expect(l.some((x) => x.tipo === 'entrega' && x.via === 'aprovacao')).toBe(true)
  })
})
