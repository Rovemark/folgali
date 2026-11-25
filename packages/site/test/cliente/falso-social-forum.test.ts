import { describe, expect, it } from 'vitest'
import { oid } from '@/lib/demo-dados'
import { APELACOES, COMUNIDADES, RESPOSTAS, TOPICOS, OBJETOS } from '@/lib/social/demo-ids'
import { DIA, HORA, Relogio, U, cliente, codigo, como } from './ajuda-social'

const topico = (comunidade: string, titulo = 'Uma pergunta honesta', extra: Record<string, unknown> = {}) => ({ comunidade, categoria: null, titulo, texto: 'Texto do tópico.', tags: [], enquete: [], enqueteDias: '3', ...extra })

describe('moderação: papéis e limites', () => {
  it('moderador não bane moderador nem dono, nem expulsa moderador; expulsa membro comum', async () => {
    const { c } = cliente()
    const gestao = (alvo: string, acao: 'banir' | 'expulsar') => c.agir({ tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cinema, alvo: U(alvo), acao, motivo: 'spam' })
    expect(await codigo(() => gestao('seixo', 'banir'))).toBe('sem-permissao')
    expect(await codigo(() => gestao('pipa', 'banir'))).toBe('sem-permissao')
    expect(await codigo(() => gestao('seixo', 'expulsar'))).toBe('sem-permissao')
    expect(await codigo(() => gestao('pipa', 'expulsar'))).toBe('sem-permissao')
    expect(await codigo(() => gestao('biscoito', 'expulsar'))).toBe('ok')
    expect((await c.registroDaComunidade(COMUNIDADES.cinema)).itens[0]).toMatchObject({ acao: 'expulsao', por: 'moderador', motivo: 'spam' })
    // o registro mostra o PAPEL, nunca a pessoa que moderou
    expect(JSON.stringify((await c.registroDaComunidade(COMUNIDADES.cinema)).itens)).not.toContain(U('lumi'))
  })
  it('expulsar e banir exigem motivo do enum; as outras ações não aceitam motivo', async () => {
    const { c } = cliente()
    const base = { tipo: 'comunidade-gestao' as const, comunidade: COMUNIDADES.cinema, alvo: U('biscoito') }
    expect(await codigo(() => c.agir({ ...base, acao: 'expulsar', motivo: null }))).toBe('invalido')
    expect(await codigo(() => c.agir({ ...base, acao: 'promover', motivo: 'spam' }))).toBe('invalido')
  })
  it('só o dono promove e rebaixa (no máximo 10 moderadores)', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.agir({ tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cinema, alvo: U('nina'), acao: 'promover', motivo: null }))).toBe('sem-permissao')
    const { r } = como('pipa')
    expect(r.executar(U('pipa'), { tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cinema, alvo: U('nina'), acao: 'promover', motivo: null })).toEqual({})
    expect((await r.comunidade(COMUNIDADES.cinema) as { moderadores: number }).moderadores).toBe(3)
    expect(await codigo(() => r.executar(U('pipa'), { tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cinema, alvo: U('nina'), acao: 'promover', motivo: null }))).toBe('ja-existe')
    r.executar(U('pipa'), { tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cinema, alvo: U('nina'), acao: 'rebaixar', motivo: null })
  })
  it('moderador remove conteúdo alheio só na sua comunidade e nunca o do dono', async () => {
    const { c } = cliente()
    const lola = oid('fbklola')
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: lola, motivo: 'fora-do-tema' })
    expect((await c.respostas(TOPICOS.cinemaPipoca)).itens.map((r) => r.id)).not.toContain(lola)
    // conteúdo do dono (Pipa) do Cinema de Sofá: o moderador não remove
    expect(await codigo(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICOS.cinemaBoasVindas, motivo: 'regras' }))).toBe('sem-permissao')
    // em comunidade onde a Lumi só é membro, ou fora dela, não remove nada
    expect(await codigo(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICOS.cozinhaPao, motivo: 'spam' }))).toBe('sem-permissao')
    expect(await codigo(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICOS.cochiloHora, motivo: 'spam' }))).toBe('sem-permissao')
    // o próprio conteúdo se apaga, não se "remove por responsável"
    expect(await codigo(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICOS.cinemaPipoca, motivo: 'spam' }))).toBe('sem-permissao')
  })
  it('remover um tópico esconde as respostas, entra no registro e o autor é avisado', async () => {
    const { c } = cliente()
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICOS.cinemaSemResposta, motivo: 'regras' })
    expect(await codigo(() => c.topico(TOPICOS.cinemaSemResposta))).toBe('removido')
    expect(await codigo(() => c.respostas(TOPICOS.cinemaSemResposta))).toBe('removido')
    expect((await c.topicos(COMUNIDADES.cinema, { ordem: 'sem-resposta' })).itens.map((t) => t.id)).not.toContain(TOPICOS.cinemaSemResposta)
    expect((await c.buscarTudo('duplicata')).topicos).toHaveLength(0)
    expect((await c.registroDaComunidade(COMUNIDADES.cinema)).itens[0]).toMatchObject({ acao: 'remocao', alvoTipo: 'topico', por: 'moderador' })
    // repetir não estoura nem duplica
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICOS.cinemaSemResposta, motivo: 'regras' })
    expect((await c.registroDaComunidade(COMUNIDADES.cinema)).itens.filter((r) => r.alvo === TOPICOS.cinemaSemResposta)).toHaveLength(1)
  })
  it('100 denúncias não escondem nada: só ordenam a fila', async () => {
    const { r } = como('lumi')
    const alvo = OBJETOS.respostaParaModerar
    for (let i = 0; i < 100; i++) r.denuncias.push({ alvo, quem: `massa-${i}`, motivo: 'assedio', em: r.now(), pesa: false })
    const fila = await r.filaDeModeracao(COMUNIDADES.vitrola)
    const item = fila.denuncias.find((d) => d.alvo === alvo)!
    expect(item.total).toBe(103)
    expect(item.peso).toBe(3)
    // continua legível, listado, citável
    expect((await r.respostas(oid('tvitrolaagulha'))).itens.map((x) => x.id)).toContain(alvo)
    expect((await r.topico(oid('tvitrolaagulha'))).respostas).toBeGreaterThan(0)
  })
  it('a fila não revela quem denunciou e ordena por peso', async () => {
    const { c } = cliente()
    const fila = await c.filaDeModeracao(COMUNIDADES.vitrola)
    expect(JSON.stringify(fila)).not.toMatch(/ps-/)
    const pesos = fila.denuncias.map((d) => d.peso)
    expect(pesos).toEqual([...pesos].sort((a, b) => b - a))
    expect(fila.apelacoes.map((a) => a.id)).toEqual([APELACOES.fiapoRemocao])
    expect(fila.apelacoes[0].conteudo).toContain('torneira')
    // o moderador que não é dono não vê apelação
    const { r } = como('ziza')
    expect((await r.filaDeModeracao(COMUNIDADES.vitrola)).apelacoes).toEqual([])
    // quem é só membro não entra na fila
    expect(await codigo(() => como('fiapo').r.filaDeModeracao(COMUNIDADES.vitrola))).toBe('sem-permissao')
  })
  it('denúncia: 10 por dia por pessoa; a mesma resposta exista o alvo ou não', async () => {
    const { r } = como('max')
    for (let i = 0; i < 10; i++) r.executar(U('max'), { tipo: 'denuncia', alvo: TOPICOS.cinemaPipoca, motivo: 'spam' })
    expect(await codigo(() => r.executar(U('max'), { tipo: 'denuncia', alvo: TOPICOS.cinemaPipoca, motivo: 'spam' }))).toBe('limite')
  })
})

describe('banido, convite e entrada', () => {
  it('o banido não entra, não posta, não vota nem aceita convite', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.agir({ tipo: 'comunidade-adesao', comunidade: COMUNIDADES.praia, acao: 'entrar' }))).toBe('banido')
    const { r } = como('lumi')
    expect(await codigo(() => r.criar(U('lumi'), 'topico', topico(COMUNIDADES.praia)))).toBe('banido')
    // ainda lê o fórum da aberta
    expect((await c.topicos(COMUNIDADES.praia)).itens.length).toBeGreaterThan(0)
    const feira = r.bdComunidades.get(COMUNIDADES.praia)!
    feira.convites.push({ uid: U('lumi'), por: U('pingo'), em: r.now() })
    expect(await codigo(() => r.executar(U('lumi'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.praia, acao: 'aceitar-convite' }))).toBe('banido')
    expect(await codigo(() => r.executar(U('pingo'), { tipo: 'comunidade-gestao', comunidade: COMUNIDADES.praia, alvo: U('lumi'), acao: 'convidar', motivo: null }))).toBe('banido')
  })
  it('aberta entra na hora, moderada vira pedido, fechada não se entra sem convite', async () => {
    const { r } = como('teco')
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.cochilo, acao: 'entrar' }).resultado).toBe('membro')
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.cozinha, acao: 'entrar' }).resultado).toBe('pendente')
    expect(await codigo(() => r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.cozinha, acao: 'entrar' }))).toBe('ja-existe')
    expect(await codigo(() => r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.jardim, acao: 'entrar' }))).toBe('nao-encontrado')
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.vitrola, acao: 'aceitar-convite' }).resultado).toBe('membro')
    expect(await codigo(() => r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.cozinha, acao: 'cancelar-pedido' }))).toBe('ok')
  })
  it('o dono não sai: transfere antes', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.agir({ tipo: 'comunidade-adesao', comunidade: COMUNIDADES.vitrola, acao: 'sair' }))).toBe('sem-permissao')
  })
  it('anti-raid: depois de 30 entradas em uma hora, a entrada na aberta vira pedido', async () => {
    const { r } = como('teco')
    const c = r.bdComunidades.get(COMUNIDADES.cochilo)!
    for (let i = 0; i < 31; i++) c.entradas.push(r.now() - i * 60_000)
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.cochilo, acao: 'entrar' }).resultado).toBe('pendente')
    expect(await codigo(() => r.executar(U('bolota'), { tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cochilo, alvo: U('teco'), acao: 'aprovar-pedido', motivo: null }))).toBe('ok')
    expect((await r.membros(COMUNIDADES.cochilo)).itens.map((m) => m.rover.handle)).toContain('teco')
  })
  it('moderação aprova e recusa pedidos; só a equipe lê pedidos, convites e banidos', async () => {
    const { c } = cliente()
    expect((await c.pedidosDeEntrada(COMUNIDADES.cinema)).itens.map((p) => p.rover.handle).sort()).toEqual(['bolota', 'capim'])
    await c.agir({ tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cinema, alvo: U('bolota'), acao: 'aprovar-pedido', motivo: null })
    await c.agir({ tipo: 'comunidade-gestao', comunidade: COMUNIDADES.cinema, alvo: U('capim'), acao: 'recusar-pedido', motivo: null })
    expect((await c.pedidosDeEntrada(COMUNIDADES.cinema)).itens).toHaveLength(0)
    expect(await codigo(() => c.pedidosDeEntrada(COMUNIDADES.cozinha))).toBe('sem-permissao')
    expect(await codigo(() => c.banidos(COMUNIDADES.cochilo))).toBe('sem-permissao')
  })
  it('apelação: o dono decide as do moderador; as do dono vão para o relé; 14 dias', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.agir({ tipo: 'apelacao-decisao', apelacao: APELACOES.pingoBanimento, resultado: 'revertida' }))).toBe('sem-permissao')
    const hidden = oid('tvitrolaremovido')
    expect(await codigo(() => c.topico(hidden))).toBe('removido')
    await c.agir({ tipo: 'apelacao-decisao', apelacao: APELACOES.fiapoRemocao, resultado: 'revertida' })
    expect((await c.topico(hidden)).titulo).toContain('torneira')
    expect(await codigo(() => c.agir({ tipo: 'apelacao-decisao', apelacao: APELACOES.fiapoRemocao, resultado: 'mantida' }))).toBe('ja-existe')
    // a janela de 14 dias
    const rel = new Relogio()
    const { r } = como('lumi', rel)
    rel.avancar(15 * DIA)
    expect(await codigo(() => r.criar(U('lumi'), 'apelacao', { tipo: 'banimento', alvo: COMUNIDADES.praia, texto: 'Fui banido por engano.' }))).toBe('fora-da-janela')
    const { r: r2 } = como('lumi')
    expect(await codigo(() => r2.criar(U('lumi'), 'apelacao', { tipo: 'banimento', alvo: COMUNIDADES.praia, texto: 'Fui banido por engano.' }))).toBe('ok')
    expect(await codigo(() => r2.criar(U('lumi'), 'apelacao', { tipo: 'banimento', alvo: COMUNIDADES.praia, texto: 'De novo.' }))).toBe('ja-existe')
  })
})

describe('fórum: tópico, fio, resolveu, enquete, edição', () => {
  it('lista com fixados, ordens e paginação', async () => {
    const { c } = cliente()
    const p1 = await c.topicos(COMUNIDADES.cinema)
    expect(p1.fixados?.map((t) => t.id)).toEqual([TOPICOS.cinemaBoasVindas])
    expect(p1.itens).toHaveLength(10)
    const p2 = await c.topicos(COMUNIDADES.cinema, { cursor: p1.proximo })
    expect(p2.fixados).toBeUndefined()
    expect(new Set([...p1.itens, ...p2.itens].map((t) => t.id)).size).toBe(p1.itens.length + p2.itens.length)
    expect((await c.topicos(COMUNIDADES.cinema, { ordem: 'sem-resposta' })).itens.map((t) => t.id)).toContain(TOPICOS.cinemaSemResposta)
    const ativos = (await c.topicos(COMUNIDADES.cinema, { ordem: 'ativos' })).itens
    expect(ativos[0].atividadeEm >= ativos[1].atividadeEm).toBe(true)
    expect((await c.topicos(COMUNIDADES.cinema, { categoria: 'Dicas' })).itens.every((t) => t.categoria === 'Dicas')).toBe(true)
  })
  it('respostas em fio de um nível com citação, e "resolveu"', async () => {
    const { c } = cliente()
    const t = await c.topico(TOPICOS.cinemaPipoca)
    expect(t.editado).toBe(true)
    expect(t.versoes).toBe(2)
    expect(t.resolvidoPor?.resposta).toBe(RESPOSTAS.pipocaResolveu)
    const topo = await c.respostas(TOPICOS.cinemaPipoca)
    expect(topo.itens.every((r) => r.em === null)).toBe(true)
    const mae = topo.itens.find((r) => r.id === RESPOSTAS.pipocaComFilhas)!
    expect(mae.filhas).toBe(2)
    const filhas = await c.respostas(TOPICOS.cinemaPipoca, { em: RESPOSTAS.pipocaComFilhas })
    const cit = filhas.itens.find((r) => r.id === RESPOSTAS.pipocaCitando)!
    expect(cit.cita?.trecho).toContain('ressalva')
    expect(topo.itens.find((r) => r.id === RESPOSTAS.pipocaResolveu)?.resolveu).toBe(true)
    const h = await c.historico(TOPICOS.cinemaPipoca)
    expect(h.map((v) => v.versao)).toEqual([1, 2])
  })
  it('a citação perde o trecho quando o citado é removido (não dá para forjar o que alguém disse)', async () => {
    const { c } = cliente()
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: oid('fbkmax'), motivo: 'regras' })
    const cit = (await c.respostas(TOPICOS.cinemaPipoca, { em: RESPOSTAS.pipocaComFilhas })).itens.find((r) => r.id === RESPOSTAS.pipocaCitando)!
    expect(cit.cita?.trecho).toBeNull()
  })
  it('responder a uma filha é "resposta funda"; trancado só aceita a moderação', async () => {
    const { r } = como('juju')
    expect(await codigo(() => r.criar(U('juju'), 'resposta-forum', { topico: TOPICOS.cinemaPipoca, em: RESPOSTAS.pipocaCitando, cita: null, texto: 'Respondendo à filha.' }))).toBe('resposta-funda')
    expect(await codigo(() => r.criar(U('juju'), 'resposta-forum', { topico: TOPICOS.cinemaPipoca, em: RESPOSTAS.pipocaComFilhas, cita: RESPOSTAS.pipocaCitando, texto: 'Respondo à mãe e cito a filha.' }))).toBe('ok')
    expect(await codigo(() => r.criar(U('juju'), 'resposta-forum', { topico: TOPICOS.cinemaTrancado, em: null, cita: null, texto: 'Posso?' }))).toBe('trancado')
    expect(await codigo(() => como('seixo').r.criar(U('seixo'), 'resposta-forum', { topico: TOPICOS.cinemaTrancado, em: null, cita: null, texto: 'A moderação pode.' }))).toBe('ok')
    expect(await codigo(() => como('bolota').r.criar(U('bolota'), 'resposta-forum', { topico: TOPICOS.cinemaPipoca, em: null, cita: null, texto: 'Sou de fora.' }))).toBe('nao-e-membro')
  })
  it('carência: membro novo espera 1 hora para abrir tópico e 10 minutos para responder', async () => {
    const rel = new Relogio()
    const { r } = como('teco', rel)
    r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.cochilo, acao: 'entrar' })
    expect(await codigo(() => r.criar(U('teco'), 'topico', topico(COMUNIDADES.cochilo)))).toBe('conta-nova')
    expect(await codigo(() => r.criar(U('teco'), 'resposta-forum', { topico: TOPICOS.cochiloHora, em: null, cita: null, texto: 'Oi.' }))).toBe('conta-nova')
    rel.avancar(11 * 60_000)
    expect(await codigo(() => r.criar(U('teco'), 'resposta-forum', { topico: TOPICOS.cochiloHora, em: null, cita: null, texto: 'Oi.' }))).toBe('ok')
    rel.avancar(HORA)
    expect(await codigo(() => r.criar(U('teco'), 'topico', topico(COMUNIDADES.cochilo)))).toBe('ok')
  })
  it('enquete: voto secreto, sem troca, encerra no prazo', async () => {
    const { c } = cliente()
    const antes = (await c.topico(TOPICOS.cinemaEnquete)).pesquisa!
    expect(antes.voce).toBeNull()
    await c.agir({ tipo: 'voto', topico: TOPICOS.cinemaEnquete, opcao: 2 })
    const depois = (await c.topico(TOPICOS.cinemaEnquete)).pesquisa!
    expect(depois.voce).toBe(2)
    expect(depois.total).toBe(antes.total + 1)
    expect(depois.opcoes[2].votos).toBe(antes.opcoes[2].votos + 1)
    expect(await codigo(() => c.agir({ tipo: 'voto', topico: TOPICOS.cinemaEnquete, opcao: 1 }))).toBe('ja-existe')
    expect(await codigo(() => c.agir({ tipo: 'voto', topico: TOPICOS.cinemaEnquete, opcao: 9 }))).toBe('invalido')
    // quem votou não é listado em lugar nenhum
    expect(JSON.stringify(await c.topico(TOPICOS.cinemaEnquete))).not.toContain(U('pipa'))
    expect(await codigo(() => c.agir({ tipo: 'voto', topico: TOPICOS.cinemaEnqueteFim, opcao: 0 }))).toBe('enquete-encerrada')
    const { r } = como('seixo')
    expect(await codigo(() => r.executar(U('seixo'), { tipo: 'voto', topico: TOPICOS.cinemaEnqueteFim, opcao: 0 }))).toBe('enquete-encerrada')
    expect((await r.topico(TOPICOS.cinemaEnqueteFim)).pesquisa?.encerrada).toBe(true)
    expect(await codigo(() => como('bolota').r.executar(U('bolota'), { tipo: 'voto', topico: TOPICOS.cinemaEnquete, opcao: 0 }))).toBe('nao-e-membro')
  })
  it('edição só em 30 minutos, no máximo 5 vezes, só do autor, nunca em tópico trancado; histórico visível', async () => {
    const rel = new Relogio()
    const { r } = como('lumi', rel)
    const t = r.criar(U('lumi'), 'topico', topico(COMUNIDADES.cinema, 'Título inicial'))
    const ed = (n: number) => r.criar(U('lumi'), 'topico-editar', { topico: t, titulo: `Título ${n}`, texto: 'Texto novo.', tags: [] })
    for (let i = 1; i <= 5; i++) expect(await codigo(() => ed(i))).toBe('ok')
    expect(await codigo(() => ed(6))).toBe('limite-de-estrutura')
    expect((await r.historico(t)).map((v) => v.titulo)).toEqual(['Título inicial', 'Título 1', 'Título 2', 'Título 3', 'Título 4', 'Título 5'])
    expect((await r.topico(t)).editado).toBe(true)
    expect(await codigo(() => como('pipa').r.criar(U('pipa'), 'topico-editar', { topico: TOPICOS.cinemaPipoca, titulo: 'Sequestro', texto: 'Outro texto.', tags: [] }))).toBe('sem-permissao')
    const t2 = r.criar(U('lumi'), 'topico', topico(COMUNIDADES.cinema, 'Outro'))
    rel.avancar(31 * 60_000)
    expect(await codigo(() => r.criar(U('lumi'), 'topico-editar', { topico: t2, titulo: 'Tarde', texto: 'Texto novo.', tags: [] }))).toBe('fora-da-janela')
    expect(await codigo(() => r.criar(U('lumi'), 'topico-editar', { topico: TOPICOS.cinemaPipoca, titulo: 'Tarde', texto: 'Texto novo.', tags: [] }))).toBe('fora-da-janela')
  })
  it('"resolveu": o autor e a moderação marcam; membro comum não, em tópico alheio', async () => {
    const { c } = cliente()
    await c.agir({ tipo: 'topico-resolvido', topico: TOPICOS.cinemaPipoca, resposta: RESPOSTAS.pipocaComFilhas })
    expect((await c.topico(TOPICOS.cinemaPipoca)).resolvidoPor?.resposta).toBe(RESPOSTAS.pipocaComFilhas)
    await c.agir({ tipo: 'topico-resolvido', topico: TOPICOS.cinemaPipoca, resposta: null })
    expect((await c.topico(TOPICOS.cinemaPipoca)).resolvido).toBe(false)
    expect(await codigo(() => como('juju').r.executar(U('juju'), { tipo: 'topico-resolvido', topico: TOPICOS.cinemaPipoca, resposta: RESPOSTAS.pipocaResolveu }))).toBe('sem-permissao')
    expect(await codigo(() => c.agir({ tipo: 'topico-resolvido', topico: TOPICOS.cinemaPipoca, resposta: oid('naoexiste') }))).toBe('nao-encontrado')
  })
  it('fixar (no máximo 3), trancar e mover', async () => {
    const { c } = cliente()
    const ids = [TOPICOS.cinemaPipoca, TOPICOS.cinemaEnquete, TOPICOS.cinemaEnqueteFim]
    for (const id of ids.slice(0, 2)) await c.agir({ tipo: 'topico-gestao', topico: id, acao: 'fixar', comunidade: null, categoria: null })
    expect(await codigo(() => c.agir({ tipo: 'topico-gestao', topico: ids[2], acao: 'fixar', comunidade: null, categoria: null }))).toBe('limite-de-estrutura')
    await c.agir({ tipo: 'topico-gestao', topico: TOPICOS.cinemaSemResposta, acao: 'trancar', comunidade: null, categoria: null })
    expect((await c.topico(TOPICOS.cinemaSemResposta)).trancado).toBe(true)
    expect(await codigo(() => como('juju').r.executar(U('juju'), { tipo: 'topico-gestao', topico: TOPICOS.cinemaPipoca, acao: 'trancar', comunidade: null, categoria: null }))).toBe('sem-permissao')
  })
  it('mover exige papel nos dois lados; de fechada para aberta exige ser o dono da origem; a categoria tem de existir', async () => {
    const { c } = cliente()
    const mover = (topico: string, destino: string, categoria: string | null = null) => c.agir({ tipo: 'topico-gestao', topico, acao: 'mover', comunidade: destino, categoria })
    // Lumi é moderador no Cinema de Sofá: destino onde é só membro, não
    expect(await codigo(() => mover(TOPICOS.cinemaSemResposta, COMUNIDADES.cozinha))).toBe('sem-permissao')
    // destino que ele nem lê (fechada que não é dele): não existe
    expect(await codigo(() => mover(TOPICOS.cinemaSemResposta, COMUNIDADES.jardim))).toBe('nao-encontrado')
    expect(await codigo(() => mover(TOPICOS.cinemaSemResposta, COMUNIDADES.cochilo))).toBe('sem-permissao')
    // dono da Vitrola para a aberta (torna público): o dono da origem pode
    expect(await codigo(() => mover(TOPICOS.vitrolaLadoB, COMUNIDADES.cinema, 'Dicas'))).toBe('ok')
    expect((await c.topico(TOPICOS.vitrolaLadoB)).comunidade).toBe(COMUNIDADES.cinema)
    expect(await codigo(() => mover(TOPICOS.cinemaSemResposta, COMUNIDADES.vitrola, 'Inexistente'))).toBe('invalido')
    // a moderadora da Vitrola que passa a moderar a aberta NÃO move de fechada para aberta
    const { r } = como('ziza')
    r.bdComunidades.get(COMUNIDADES.cinema)!.membros.set(U('ziza'), { papel: 'moderador', desde: r.now() - DIA })
    expect(await codigo(() => r.executar(U('ziza'), { tipo: 'topico-gestao', topico: oid('tvitrolacapa'), acao: 'mover', comunidade: COMUNIDADES.cinema, categoria: null }))).toBe('sem-permissao')
  })
})

describe('notificações: sem texto, sem ruído', () => {
  it('a notificação carrega só ponteiros, nunca trecho de texto', async () => {
    const { c } = cliente()
    const itens = (await c.notificacoes(U('lumi'))).itens
    for (const n of itens) {
      expect(Object.keys(n).sort()).toEqual(['comunidade', 'em', 'nomeDoLugar', 'nomeDoTopico', 'objeto', 'origem', 'pagina', 'seq', 'tipo'])
    }
    expect(JSON.stringify(itens)).not.toContain('Traduzi')
  })
  it('resposta notifica o autor do tópico, a mãe, o citado e o mencionado, uma por pessoa', async () => {
    const { r } = como('lumi')
    // a Lumi abre um tópico; Pipa responde, Max responde à Pipa citando a Lumi...
    const t = r.criar(U('lumi'), 'topico', topico(COMUNIDADES.cinema, 'Teste de aviso'))
    const a = r.criar(U('pipa'), 'resposta-forum', { topico: t, em: null, cita: null, texto: 'Primeira.' })
    r.criar(U('max'), 'resposta-forum', { topico: t, em: a, cita: null, texto: 'Mais uma, @lumi e @pipa.' })
    const tipos = (await r.notificacoes(U('lumi'))).itens.filter((n) => n.nomeDoTopico === 'Teste de aviso').map((n) => n.tipo)
    expect(tipos.sort()).toEqual(['resposta-no-topico', 'resposta-no-topico'])
    // a Pipa recebeu UMA só pela resposta do Max (a de maior prioridade: "resposta-a-voce"), apesar de mãe e menção
    const { r: rp } = como('pipa')
    const t2 = rp.criar(U('lumi'), 'topico', topico(COMUNIDADES.cinema, 'Outro aviso'))
    const a2 = rp.criar(U('pipa'), 'resposta-forum', { topico: t2, em: null, cita: null, texto: 'Primeira.' })
    rp.criar(U('max'), 'resposta-forum', { topico: t2, em: a2, cita: a2, texto: 'Falo com @pipa.' })
    const dela = (await rp.notificacoes(U('pipa'))).itens.filter((n) => n.nomeDoTopico === 'Outro aviso')
    expect(dela.map((n) => n.tipo)).toEqual(['resposta-a-voce'])
  })
  it('silenciado e bloqueado não notificam', async () => {
    const { c } = cliente()
    const antes = await c.contagemDeNotificacoes(U('lumi'))
    como('pingo').r.executar(U('pingo'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' })
    expect(await c.contagemDeNotificacoes(U('lumi'))).toBe(antes)
    const { r } = como('lumi')
    r.executar(U('pingo'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' })
    expect((await r.contagemDeNotificacoes(U('lumi'))) - (await r.contagemDeNotificacoes(U('lumi'), 21))).toBeGreaterThanOrEqual(0)
    expect((await r.notificacoes(U('lumi'))).itens.some((n) => n.origem?.handle === 'pingo')).toBe(false)
  })
  it('só o próprio lê as suas notificações, pedidos, convites e relações', async () => {
    const { c } = cliente()
    for (const f of [() => c.notificacoes(U('pipa')), () => c.amizadesPendentes(U('pipa')), () => c.convites(U('pipa')), () => c.relacoes(U('pipa'))]) expect(await codigo(f)).toBe('sem-permissao')
    expect((await c.convites(U('lumi')))[0].comunidade.nome).toBe('Jardim de Varanda')
    expect((await c.relacoes(U('lumi'))).itens.map((x) => x.relacao).sort()).toEqual(['bloqueio', 'silencio'])
  })
})

describe('topicoDeObjeto: o aviso aponta para a RESPOSTA e a tela precisa achar o tópico', () => {
  it('um tópico responde o próprio id; uma resposta, o do tópico dela; o que não é do fórum, não encontrado', async () => {
    const { c } = cliente()
    expect(await c.topicoDeObjeto(TOPICOS.cinemaPipoca)).toBe(TOPICOS.cinemaPipoca)
    expect(await c.topicoDeObjeto(RESPOSTAS.pipocaComFilhas)).toBe(TOPICOS.cinemaPipoca)
    expect(await codigo(() => c.topicoDeObjeto(oid('nada-disso')))).toBe('nao-encontrado')
  })
})
