import { describe, expect, it } from 'vitest'
import { oid } from '@/lib/demo-dados'
import { COMUNIDADES, OBJETOS } from '@/lib/social/demo-ids'
import { DIA, U, como, codigo, mensagem } from './ajuda-social'

// Os casos de borda que o medidor de mutação apontou no cliente de demonstração da 0.3.1: ordem, filtros e mensagens.
// Os dados extras entram direto na demonstração (como o teste de "denúncia nova reabre o caso" já faz), porque a semente só tem um de cada.

describe('depoimentos enviados: ordem e filtros', () => {
  it('o mais novo primeiro; fora o que já foi decidido, o apagado, o de outro autor e o de rover que não existe mais', async () => {
    const { r } = como('lumi')
    const agora = r.now()
    const base = { autor: U('lumi'), alvo: U('pipa'), estado: 'pendente' as const }
    r.bdDepoimentos.push(
      { ...base, id: oid('dvelho'), texto: 'velho', em: agora - 3 * DIA },
      { ...base, id: oid('dnovo'), texto: 'novo', em: agora - 1000 },
      { ...base, id: oid('daceito'), texto: 'aceito', em: agora - 500, estado: 'aceito' },
      { ...base, id: oid('dapagado'), texto: 'apagado', em: agora - 400, apagado: true },
      { ...base, id: oid('dalheio'), texto: 'alheio', em: agora - 300, autor: U('nina') },
      { ...base, id: oid('dfantasma'), texto: 'fantasma', em: agora - 200, alvo: U('rover-que-nao-existe') },
    )
    const textos = (await r.depoimentosEnviados(U('lumi'))).itens.map((x) => x.texto)
    expect(textos).not.toContain('aceito')
    expect(textos).not.toContain('apagado')
    expect(textos).not.toContain('alheio')
    expect(textos).not.toContain('fantasma')
    // a ordem: o novo vem antes do velho, e o da semente (que é mais antigo que o novo) não passa à frente dele
    expect(textos.indexOf('novo')).toBeLessThan(textos.indexOf('velho'))
    const todos = (await r.depoimentosEnviados(U('lumi'))).itens
    const instantes = todos.map((x) => Date.parse(x.criadoEm))
    expect(instantes).toEqual([...instantes].sort((a, b) => b - a))
  })
})

describe('removidos: ordem, filtros e situação da apelação', () => {
  const retido = (r: ReturnType<typeof como>['r'], alvo: string, autor: string, texto: string) =>
    r.retidos.set(alvo, { texto, tipo: 'topico', autor, removidoEm: r.now(), porPapel: 'dono', comunidade: COMUNIDADES.praia, pagina: null })
  const reg = (r: ReturnType<typeof como>['r'], extra: Partial<(typeof r.registro)[number]>) =>
    r.registro.push({ id: 'regx', em: r.now(), escopo: 'comunidade', contexto: COMUNIDADES.praia, acao: 'remocao', alvoTipo: 'topico', alvo: oid('tx'), motivo: 'spam', por: 'dono', ...extra })

  it('o mais recente primeiro; dispensa e expulsão do mesmo alvo não entram como removido; o de outro autor não aparece', async () => {
    const { r } = como('lumi')
    const agora = r.now()
    retido(r, oid('tvelho'), U('lumi'), 'texto velho')
    retido(r, oid('tnovo'), U('lumi'), 'texto novo')
    retido(r, oid('tdispensado'), U('lumi'), 'dispensado')
    retido(r, oid('talheio'), U('nina'), 'alheio')
    reg(r, { id: 'r-velho', alvo: oid('tvelho'), em: agora - 9 * DIA })
    reg(r, { id: 'r-novo', alvo: oid('tnovo'), em: agora - 1 * DIA })
    reg(r, { id: 'r-dispensa', alvo: oid('tdispensado'), em: agora - 100, acao: 'dispensa', motivo: 'dispensada' })
    reg(r, { id: 'r-alheio', alvo: oid('talheio'), em: agora - 50 })
    const itens = (await r.removidos(U('lumi'))).itens
    const ids = itens.map((x) => x.id)
    expect(ids).not.toContain('r-dispensa')
    expect(ids).not.toContain('r-alheio')
    expect(ids.indexOf('r-novo')).toBeLessThan(ids.indexOf('r-velho'))
    const instantes = itens.map((x) => Date.parse(x.em))
    expect(instantes).toEqual([...instantes].sort((a, b) => b - a))
  })

  it('a apelação vem da situação real da apelação ligada; sem apelação, ou com id que não existe mais, é nula', async () => {
    const { r } = como('lumi')
    retido(r, oid('ta1'), U('lumi'), 'um')
    retido(r, oid('ta2'), U('lumi'), 'dois')
    retido(r, oid('ta3'), U('lumi'), 'tres')
    retido(r, oid('ta4'), U('lumi'), 'quatro')
    r.apelacoes.push(
      { id: 'ap-a', tipo: 'remocao', alvo: oid('ta1'), autor: U('lumi'), texto: 'x', em: r.now(), comunidade: COMUNIDADES.praia, pagina: null, agiuPor: 'dono', situacao: 'aberta' },
      { id: 'ap-b', tipo: 'remocao', alvo: oid('ta2'), autor: U('lumi'), texto: 'x', em: r.now(), comunidade: COMUNIDADES.praia, pagina: null, agiuPor: 'dono', situacao: 'revertida' },
    )
    reg(r, { id: 'r-a1', alvo: oid('ta1'), apelacaoId: 'ap-a' })
    reg(r, { id: 'r-a2', alvo: oid('ta2'), apelacaoId: 'ap-b' })
    reg(r, { id: 'r-a3', alvo: oid('ta3') })
    reg(r, { id: 'r-a4', alvo: oid('ta4'), apelacaoId: 'ap-sumiu' })
    const por = new Map((await r.removidos(U('lumi'))).itens.map((x) => [x.id, x]))
    expect(por.get('r-a1')?.apelacao).toBe('aberta')
    expect(por.get('r-a2')?.apelacao).toBe('revertida')
    expect(por.get('r-a3')?.apelacao).toBeNull()
    expect(por.get('r-a4')?.apelacao).toBeNull()
    expect(por.get('r-a1')?.trecho).toBe('um')
  })
})

describe('temas de páginas: só as abertas, e empate em ordem alfabética', () => {
  it('uma página encerrada não conta no tema; no empate vence a ordem alfabética do tema', async () => {
    const { r } = como('lumi')
    const antes = await r.temasDePaginas()
    const empatados = antes.filter((x) => x.paginas === antes[antes.length - 1].paginas).map((x) => x.tema)
    expect(empatados).toEqual([...empatados].sort((a, b) => a.localeCompare(b)))
    // encerrar uma página tira 1 do tema dela (ou o tema inteiro, se era a única)
    const pg = [...r.bdPaginas.values()].find((p) => !p.encerrada)!
    const n = antes.find((x) => x.tema === pg.tema)!.paginas
    pg.encerrada = true
    const depois = await r.temasDePaginas()
    expect(depois.find((x) => x.tema === pg.tema)?.paginas ?? 0).toBe(n - 1)
    // ordenação estável por contagem decrescente
    const cont = depois.map((x) => x.paginas)
    expect(cont).toEqual([...cont].sort((a, b) => b - a))
  })
  it('o empate de contagem sai em ordem alfabética mesmo com temas inseridos fora de ordem', async () => {
    const { r } = como('lumi')
    for (const p of r.bdPaginas.values()) p.encerrada = true
    const base = [...r.bdPaginas.values()][0]
    for (const [i, tema] of ['zebra', 'abacate', 'manga'].entries()) r.bdPaginas.set(`pg-t${i}`, { ...base, id: `pg-t${i}`, tema, encerrada: false })
    expect((await r.temasDePaginas()).map((x) => x.tema)).toEqual(['abacate', 'manga', 'zebra'])
    r.bdPaginas.set('pg-t9', { ...base, id: 'pg-t9', tema: 'zebra', encerrada: false })
    expect(await r.temasDePaginas()).toEqual([{ tema: 'zebra', paginas: 2 }, { tema: 'abacate', paginas: 1 }, { tema: 'manga', paginas: 1 }])
  })
})

describe('temas de páginas: teto de 50', () => {
  it('com mais de 50 temas só os 50 primeiros saem', async () => {
    const { r } = como('lumi')
    for (const p of r.bdPaginas.values()) p.encerrada = true
    const base = [...r.bdPaginas.values()][0]
    for (let i = 0; i < 55; i++) r.bdPaginas.set(`pg-m${i}`, { ...base, id: `pg-m${i}`, tema: `tema${String(i).padStart(2, '0')}`, encerrada: false })
    const temas = await r.temasDePaginas()
    expect(temas).toHaveLength(50)
    expect(temas[0].tema).toBe('tema00')
    expect(temas[49].tema).toBe('tema49')
  })
})

describe('dispensar denúncia: o que o erro diz e o tipo do alvo no registro', () => {
  const alvoResposta = OBJETOS.respostaParaModerar
  it('comunidade que não existe é nao-encontrado (e nunca um erro de programa)', async () => {
    const { r } = como('lumi')
    expect(await mensagem(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: oid('nao-existe'), alvo: alvoResposta }))).toBe('comunidade não encontrada')
  })
  it('comunidade encerrada também é nao-encontrado', async () => {
    const { r } = como('lumi')
    r.bdComunidades.get(COMUNIDADES.vitrola)!.encerrada = true
    expect(await mensagem(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo: alvoResposta }))).toBe('comunidade não encontrada')
  })
  it('quem não é equipe recebe a razão certa, e quem dispensa sem denúncia aberta também', async () => {
    expect(await mensagem(() => como('fiapo').r.executar(U('fiapo'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo: alvoResposta }))).toBe('só o dono e a moderação dispensam denúncias')
    const { r } = como('lumi')
    expect(await mensagem(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.cinema, alvo: oid('nada') }))).toBe('não há denúncia aberta para isto nesta comunidade')
  })
  it('dispensar a denúncia de um TÓPICO registra `topico`; a de uma resposta registra `resposta-forum`', async () => {
    const { r } = como('lumi')
    const fila = await r.filaDeModeracao(COMUNIDADES.vitrola)
    const topico = fila.denuncias.find((x) => x.alvoTipo === 'topico')!
    expect(await codigo(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo: topico.alvo }))).toBe('ok')
    expect(await codigo(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo: alvoResposta }))).toBe('ok')
    const regs = (await r.registroDaComunidade(COMUNIDADES.vitrola)).itens.filter((x) => x.acao === 'dispensa')
    expect(regs.find((x) => x.alvo === topico.alvo)?.alvoTipo).toBe('topico')
    expect(regs.find((x) => x.alvo === alvoResposta)?.alvoTipo).toBe('resposta-forum')
  })
})
