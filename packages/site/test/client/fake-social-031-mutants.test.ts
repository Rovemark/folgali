import { describe, expect, it } from 'vitest'
import { oid } from '@/lib/demo-data'
import { COMMUNITIES, OBJECTS } from '@/lib/social/demo-ids'
import { DAY, U, as, code, message } from './social-help'

// The edge cases the mutation testing pointed out in the 0.3.1 demo client: order, filters and messages.
// The extra data goes straight into the demo (as the "new report reopens the case" test already does), because the seed has only one of each.

describe('depoimentos enviados: ordem e filtros', () => {
  it('newest first; leaving out what was already decided, the deleted one, another author\'s and a rover that no longer exists', async () => {
    const { r } = as('lumi')
    const now = r.now()
    const base = { autor: U('lumi'), alvo: U('pipa'), estado: 'pendente' as const }
    r.dbTestimonials.push(
      { ...base, id: oid('dvelho'), texto: 'velho', em: now - 3 * DAY },
      { ...base, id: oid('dnovo'), texto: 'novo', em: now - 1000 },
      { ...base, id: oid('daceito'), texto: 'aceito', em: now - 500, estado: 'aceito' },
      { ...base, id: oid('dapagado'), texto: 'apagado', em: now - 400, apagado: true },
      { ...base, id: oid('dalheio'), texto: 'alheio', em: now - 300, autor: U('nina') },
      { ...base, id: oid('dfantasma'), texto: 'fantasma', em: now - 200, alvo: U('rover-que-nao-existe') },
    )
    const texts = (await r.depoimentosEnviados(U('lumi'))).itens.map((x) => x.texto)
    expect(texts).not.toContain('aceito')
    expect(texts).not.toContain('apagado')
    expect(texts).not.toContain('alheio')
    expect(texts).not.toContain('fantasma')
    // the order: the new one comes before the old one, and the seed's (older than the new one) does not get ahead of it
    expect(texts.indexOf('novo')).toBeLessThan(texts.indexOf('velho'))
    const all = (await r.depoimentosEnviados(U('lumi'))).itens
    const instants = all.map((x) => Date.parse(x.criadoEm))
    expect(instants).toEqual([...instants].sort((a, b) => b - a))
  })
})

describe('removed: order, filters and appeal status', () => {
  const held_ = (r: ReturnType<typeof as>['r'], target: string, author: string, text: string) =>
    r.held.set(target, { texto: text, tipo: 'topico', autor: author, removidoEm: r.now(), byRole: 'dono', comunidade: COMMUNITIES.praia, pagina: null })
  const reg = (r: ReturnType<typeof as>['r'], extra: Partial<(typeof r.registro)[number]>) =>
    r.registro.push({ id: 'regx', em: r.now(), escopo: 'comunidade', contexto: COMMUNITIES.praia, acao: 'remocao', alvoTipo: 'topico', alvo: oid('tx'), motivo: 'spam', por: 'dono', ...extra })

  it('most recent first; a dismissal and an expulsion of the same target do not count as removed; another author\'s does not appear', async () => {
    const { r } = as('lumi')
    const now = r.now()
    held_(r, oid('tvelho'), U('lumi'), 'texto velho')
    held_(r, oid('tnovo'), U('lumi'), 'texto novo')
    held_(r, oid('tdispensado'), U('lumi'), 'dispensado')
    held_(r, oid('talheio'), U('nina'), 'alheio')
    reg(r, { id: 'r-velho', alvo: oid('tvelho'), em: now - 9 * DAY })
    reg(r, { id: 'r-novo', alvo: oid('tnovo'), em: now - 1 * DAY })
    reg(r, { id: 'r-dispensa', alvo: oid('tdispensado'), em: now - 100, acao: 'dispensa', motivo: 'dispensada' })
    reg(r, { id: 'r-alheio', alvo: oid('talheio'), em: now - 50 })
    const items = (await r.removidos(U('lumi'))).itens
    const ids = items.map((x) => x.id)
    expect(ids).not.toContain('r-dispensa')
    expect(ids).not.toContain('r-alheio')
    expect(ids.indexOf('r-novo')).toBeLessThan(ids.indexOf('r-velho'))
    const instants = items.map((x) => Date.parse(x.em))
    expect(instants).toEqual([...instants].sort((a, b) => b - a))
  })

  it('the appeal comes from the real status of the linked appeal; with no appeal, or with an id that no longer exists, it is null', async () => {
    const { r } = as('lumi')
    held_(r, oid('ta1'), U('lumi'), 'um')
    held_(r, oid('ta2'), U('lumi'), 'dois')
    held_(r, oid('ta3'), U('lumi'), 'tres')
    held_(r, oid('ta4'), U('lumi'), 'quatro')
    r.apelacoes.push(
      { id: 'ap-a', tipo: 'remocao', alvo: oid('ta1'), autor: U('lumi'), texto: 'x', em: r.now(), comunidade: COMMUNITIES.praia, pagina: null, agiuPor: 'dono', situacao: 'aberta' },
      { id: 'ap-b', tipo: 'remocao', alvo: oid('ta2'), autor: U('lumi'), texto: 'x', em: r.now(), comunidade: COMMUNITIES.praia, pagina: null, agiuPor: 'dono', situacao: 'revertida' },
    )
    reg(r, { id: 'r-a1', alvo: oid('ta1'), appealId: 'ap-a' })
    reg(r, { id: 'r-a2', alvo: oid('ta2'), appealId: 'ap-b' })
    reg(r, { id: 'r-a3', alvo: oid('ta3') })
    reg(r, { id: 'r-a4', alvo: oid('ta4'), appealId: 'ap-sumiu' })
    const by = new Map((await r.removidos(U('lumi'))).itens.map((x) => [x.id, x]))
    expect(by.get('r-a1')?.apelacao).toBe('aberta')
    expect(by.get('r-a2')?.apelacao).toBe('revertida')
    expect(by.get('r-a3')?.apelacao).toBeNull()
    expect(by.get('r-a4')?.apelacao).toBeNull()
    expect(by.get('r-a1')?.trecho).toBe('um')
  })
})

describe('page topics: only the open ones, and ties in alphabetical order', () => {
  it('a closed page does not count toward the topic; on a tie the topic\'s alphabetical order wins', async () => {
    const { r } = as('lumi')
    const before = await r.temasDePaginas()
    const tied = before.filter((x) => x.paginas === before[before.length - 1].paginas).map((x) => x.tema)
    expect(tied).toEqual([...tied].sort((a, b) => a.localeCompare(b)))
    // closing a page takes 1 off its topic (or the whole topic, if it was the only one)
    const pg = [...r.dbPages.values()].find((p) => !p.encerrada)!
    const n = before.find((x) => x.tema === pg.tema)!.paginas
    pg.encerrada = true
    const after = await r.temasDePaginas()
    expect(after.find((x) => x.tema === pg.tema)?.paginas ?? 0).toBe(n - 1)
    // stable ordering by descending count
    const cont = after.map((x) => x.paginas)
    expect(cont).toEqual([...cont].sort((a, b) => b - a))
  })
  it('a count tie comes out in alphabetical order even with topics inserted out of order', async () => {
    const { r } = as('lumi')
    for (const p of r.dbPages.values()) p.encerrada = true
    const base = [...r.dbPages.values()][0]
    for (const [i, theme] of ['zebra', 'abacate', 'manga'].entries()) r.dbPages.set(`pg-t${i}`, { ...base, id: `pg-t${i}`, tema: theme, encerrada: false })
    expect((await r.temasDePaginas()).map((x) => x.tema)).toEqual(['abacate', 'manga', 'zebra'])
    r.dbPages.set('pg-t9', { ...base, id: 'pg-t9', tema: 'zebra', encerrada: false })
    expect(await r.temasDePaginas()).toEqual([{ tema: 'zebra', paginas: 2 }, { tema: 'abacate', paginas: 1 }, { tema: 'manga', paginas: 1 }])
  })
})

describe('page topics: ceiling of 50', () => {
  it('with more than 50 topics only the first 50 come out', async () => {
    const { r } = as('lumi')
    for (const p of r.dbPages.values()) p.encerrada = true
    const base = [...r.dbPages.values()][0]
    for (let i = 0; i < 55; i++) r.dbPages.set(`pg-m${i}`, { ...base, id: `pg-m${i}`, tema: `tema${String(i).padStart(2, '0')}`, encerrada: false })
    const themes = await r.temasDePaginas()
    expect(themes).toHaveLength(50)
    expect(themes[0].tema).toBe('tema00')
    expect(themes[49].tema).toBe('tema49')
  })
})

describe('dismiss a report: what the error says and the type of the target in the log', () => {
  const replyTarget = OBJECTS.replyToModerate
  it('a community that does not exist is nao-encontrado (and never a program error)', async () => {
    const { r } = as('lumi')
    expect(await message(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: oid('nao-existe'), alvo: replyTarget }))).toBe('comunidade não encontrada')
  })
  it('a closed community is also nao-encontrado', async () => {
    const { r } = as('lumi')
    r.dbCommunities.get(COMMUNITIES.vitrola)!.encerrada = true
    expect(await message(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: replyTarget }))).toBe('comunidade não encontrada')
  })
  it('whoever is not staff gets the right reason, and so does whoever dismisses without an open report', async () => {
    expect(await message(() => as('fiapo').r.executar(U('fiapo'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: replyTarget }))).toBe('só o dono e a moderação dispensam denúncias')
    const { r } = as('lumi')
    expect(await message(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.cinema, alvo: oid('nada') }))).toBe('não há denúncia aberta para isto nesta comunidade')
  })
  it('dismissing a report on a TOPIC records `topico`; on a reply it records `resposta-forum`', async () => {
    const { r } = as('lumi')
    const queue = await r.filaDeModeracao(COMMUNITIES.vitrola)
    const topic = queue.denuncias.find((x) => x.alvoTipo === 'topico')!
    expect(await code(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: topic.alvo }))).toBe('ok')
    expect(await code(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: replyTarget }))).toBe('ok')
    const regs = (await r.registroDaComunidade(COMMUNITIES.vitrola)).itens.filter((x) => x.acao === 'dispensa')
    expect(regs.find((x) => x.alvo === topic.alvo)?.alvoTipo).toBe('topico')
    expect(regs.find((x) => x.alvo === replyTarget)?.alvoTipo).toBe('resposta-forum')
  })
})
