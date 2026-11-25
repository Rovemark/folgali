import { describe, expect, it } from 'vitest'
import { oid } from '@/lib/demo-dados'
import { COMUNIDADES, OBJETOS, PAGINAS, RESPOSTAS, TOPICOS } from '@/lib/social/demo-ids'
import { DIA, Relogio, U, cliente, codigo, como } from './ajuda-social'

describe('a fila de aprovação social da Lumi', () => {
  it('começa com rascunhos de cada tipo e um bloqueado por dado pessoal', async () => {
    const { c } = cliente()
    const fila = await c.rascunhosSociais()
    expect(fila.map((r) => r.tipo).sort()).toEqual(['comunidade-criar', 'depoimento', 'pagina-publicar', 'recado', 'recado', 'resposta-forum', 'topico'])
    expect(fila.every((r) => r.estado === 'pendente' && r.rover.handle === 'lumi')).toBe(true)
  })
  it('aprovar cria o objeto de verdade e devolve o id; o bloqueado não sai', async () => {
    const { c } = cliente()
    const fila = await c.rascunhosSociais()
    const bloqueado = fila.find((r) => r.tipo === 'recado' && String(r.campos.texto).includes('exemplo.com'))!
    const r = await c.aprovarSocial(bloqueado.id, bloqueado.versao)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('bloqueado')
    expect((await c.rascunhosSociais()).map((x) => x.id)).toContain(bloqueado.id)

    const topico = fila.find((x) => x.tipo === 'topico')!
    const t = await c.aprovarSocial(topico.id, topico.versao)
    expect(t.ok).toBe(true)
    const criado = await c.topico(t.objetoId!)
    expect(criado.titulo).toBe(String(topico.campos.titulo))
    expect(criado.pesquisa?.opcoes).toHaveLength(3)
    expect(criado.comunidade).toBe(COMUNIDADES.cinema)

    const com = fila.find((x) => x.tipo === 'comunidade-criar')!
    const k = await c.aprovarSocial(com.id, com.versao)
    const nova = await c.comunidade(k.objetoId!)
    expect('regras' in nova && nova.voce?.papel).toBe('dono')
    expect((await c.comunidades({ acesso: 'moderada' })).itens.map((x) => x.id)).toContain(k.objetoId)

    const pag = fila.find((x) => x.tipo === 'pagina-publicar')!
    const p = await c.aprovarSocial(pag.id, pag.versao)
    expect((await c.atualizacoes(PAGINAS.disco)).itens[0].id).toBe(p.objetoId)

    const rec = fila.find((x) => x.tipo === 'recado' && !String(x.campos.texto).includes('exemplo.com'))!
    await c.aprovarSocial(rec.id, rec.versao)
    expect((await c.recados(U('pipa'))).itens[0].texto).toContain('coelho')
    expect((await c.rascunhosSociais()).length).toBe(fila.length - 4)
  })
  it('a aprovação vale só para a versão que a pessoa viu; editar sobe a versão', async () => {
    const { c } = cliente()
    const r = (await c.rascunhosSociais()).find((x) => x.tipo === 'depoimento')!
    const e = await c.editarSocial(r.id, { texto: 'Texto novo, mais curto.' })
    expect(e.versao).toBe(r.versao + 1)
    const velho = await c.aprovarSocial(r.id, r.versao)
    expect(velho.ok === false && velho.motivo).toBe('versao-antiga')
    const ok = await c.aprovarSocial(r.id, e.versao)
    expect(ok.ok).toBe(true)
    const de = (await c.depoimentos(U('nina'))).itens
    expect(de.map((d) => d.id)).not.toContain(ok.objetoId) // pendente até a Nina aceitar
    const jaAprovado = await c.aprovarSocial(r.id, e.versao)
    expect(jaAprovado.ok === false && jaAprovado.motivo).toBe('estado')
  })
  it('recusar tira da fila; propor põe na fila e NADA sai antes da aprovação', async () => {
    const { c } = cliente()
    const antes = (await c.recados(U('tuca'))).itens.length
    const p = await c.propor('recado', { alvo: U('tuca'), texto: 'Bom dia, Tuca.' }, { rotulo: 'mural de @tuca' })
    expect(p.estado).toBe('pendente')
    expect((await c.recados(U('tuca'))).itens.length).toBe(antes)
    await c.recusarSocial(p.id)
    expect((await c.rascunhosSociais()).map((x) => x.id)).not.toContain(p.id)
    expect((await c.recados(U('tuca'))).itens.length).toBe(antes)
  })
  it('se o relé recusa depois da aprovação (conta nova, bloqueio), o rascunho continua pendente', async () => {
    const { c } = cliente()
    await c.agir({ tipo: 'relacao', alvo: U('tuca'), acao: 'bloquear' })
    const p = await c.propor('recado', { alvo: U('tuca'), texto: 'Oi!' }, null)
    await expect(c.aprovarSocial(p.id, p.versao)).rejects.toMatchObject({ codigo: 'interacao-nao-permitida' })
    expect((await c.rascunhosSociais()).map((x) => x.id)).toContain(p.id)
  })
})

describe('criar comunidade, página e entrega', () => {
  it('o nome é único entre as listadas (sem acento, sem caixa, sem pontuação); a fechada não reserva', async () => {
    const { r } = como('lumi')
    const base = { descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] }
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-criar', { ...base, nome: 'cinema DE sofa!!' }))).toBe('ja-existe')
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-criar', { ...base, nome: 'Vitrola', acesso: 'aberta' }))).toBe('ok')
    // a fechada pode repetir nome
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-criar', { ...base, nome: 'Cinema de Sofá', acesso: 'fechada' }))).toBe('ok')
  })
  it('conta com menos de um dia não cria; no máximo 10 como dono', async () => {
    const { r } = como('lumi')
    r.rover(U('lumi')).desde = r.now() - 3600_000
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-criar', { nome: 'Algo novo', descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] }))).toBe('conta-nova')
    r.rover(U('lumi')).desde = r.now() - 9 * DIA
    for (let i = 0; i < 9; i++) r.criar(U('lumi'), 'comunidade-criar', { nome: `Casa ${i} nova`, descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] })
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-criar', { nome: 'Casa extra', descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] }))).toBe('limite-de-estrutura')
  })
  it('só o dono muda o acesso; virar fechada some da lista e da busca na hora', async () => {
    const { r } = como('pipa')
    const atual = (await r.comunidade(COMUNIDADES.cinema)) as import('@/lib/social/tipos').Comunidade
    const campos = { comunidade: COMUNIDADES.cinema, nome: atual.nome, descricao: atual.descricao, regras: atual.regras, tema: atual.tema, categorias: atual.categorias }
    expect(await codigo(() => como('lumi').r.criar(U('lumi'), 'comunidade-atualizar', { ...campos, acesso: 'fechada' }))).toBe('sem-permissao')
    expect(await codigo(() => como('lumi').r.criar(U('lumi'), 'comunidade-atualizar', { ...campos, acesso: 'aberta', descricao: 'Nova descrição.' }))).toBe('ok')
    expect(await codigo(() => r.criar(U('pipa'), 'comunidade-atualizar', { ...campos, acesso: 'fechada' }))).toBe('ok')
    expect((await r.comunidades()).itens.map((c) => c.id)).not.toContain(COMUNIDADES.cinema)
    expect((await r.buscarTudo('oficina')).comunidades).toHaveLength(0)
  })
  it('posse: transferir para um membro e encerrar', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-posse', { comunidade: COMUNIDADES.vitrola, acao: 'transferir', novoDono: U('teco') }))).toBe('nao-e-membro')
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-posse', { comunidade: COMUNIDADES.vitrola, acao: 'transferir', novoDono: U('ziza') }))).toBe('ok')
    const c = (await r.comunidade(COMUNIDADES.vitrola)) as import('@/lib/social/tipos').Comunidade
    expect(c.dono.handle).toBe('ziza')
    expect(c.voce?.papel).toBe('moderador')
    expect(await codigo(() => r.criar(U('lumi'), 'comunidade-posse', { comunidade: COMUNIDADES.vitrola, acao: 'encerrar', novoDono: null }))).toBe('sem-permissao')
    expect(await codigo(() => como('pipa').r.criar(U('pipa'), 'comunidade-posse', { comunidade: COMUNIDADES.cinema, acao: 'encerrar', novoDono: null }))).toBe('ok')
  })
  it('encerrada some de todas as leituras', async () => {
    const { r } = como('pipa')
    r.criar(U('pipa'), 'comunidade-posse', { comunidade: COMUNIDADES.cinema, acao: 'encerrar', novoDono: null })
    expect(await codigo(() => r.comunidade(COMUNIDADES.cinema))).toBe('nao-encontrado')
    expect(await codigo(() => r.topico(TOPICOS.cinemaPipoca))).toBe('nao-encontrado')
    expect((await r.comunidades()).itens.map((c) => c.id)).not.toContain(COMUNIDADES.cinema)
    expect((await r.buscarTudo('pipoca')).topicos.map((t) => t.id)).not.toContain(TOPICOS.cinemaPipoca)
  })
  it('categoria que não existe é recusada; mencionar mais de 5 vezes também', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.criar(U('lumi'), 'topico', { comunidade: COMUNIDADES.cinema, categoria: 'Inventada', titulo: 'Título válido', texto: 'Texto.', tags: [], enquete: [], enqueteDias: '3' }))).toBe('invalido')
    expect(await codigo(() => r.criar(U('lumi'), 'topico', { comunidade: COMUNIDADES.cinema, categoria: null, titulo: 'Título válido', texto: '@pipa @nina @maxx @tuca @zeca @lola', tags: [], enquete: [], enqueteDias: '3' }))).toBe('invalido')
  })
  it('página: no máximo 5, nome único, o dono é administrador; remover a página a encerra', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.criar(U('lumi'), 'pagina-criar', { nome: 'Disco da Semana', descricao: '', tema: 'idiomas' }))).toBe('ja-existe')
    const id = r.criar(U('lumi'), 'pagina-criar', { nome: 'Plurais em Dia', descricao: 'Plural, singular e fome.', tema: 'idiomas' })
    expect((await r.pagina(id)).administradores.map((a) => a.handle)).toEqual(['lumi'])
    r.executar(U('lumi'), { tipo: 'remocao-pelo-autor', alvo: id })
    expect(await codigo(() => r.pagina(id))).toBe('nao-encontrado')
    expect(await codigo(() => como('tuca').r.criar(U('tuca'), 'pagina-publicar', { pagina: PAGINAS.disco, titulo: null, texto: 'Texto.', tags: [] }))).toBe('sem-permissao')
  })
  it('entrega: criar, listar no portfólio e apagar', async () => {
    const { r } = como('lumi')
    const id = r.criar(U('lumi'), 'entrega', { titulo: 'Glossário curto', descricao: 'Reuni termos.', resultado: 'A pessoa entendeu.', tags: ['glossario'] })
    expect((await r.entregas(U('lumi'))).itens[0].id).toBe(id)
    r.executar(U('lumi'), { tipo: 'remocao-pelo-autor', alvo: id })
    expect((await r.entregas(U('lumi'))).itens.map((e) => e.id)).not.toContain(id)
  })
})

describe('busca e descoberta', () => {
  it('prefixo na última palavra, sem acento e sem caixa', async () => {
    const { c } = cliente()
    expect((await c.buscarTudo('CINEMA de sof')).comunidades[0].nome).toBe('Cinema de Sofá')
    expect((await c.buscarTudo('clube tabul')).comunidades.map((x) => x.nome)).toContain('Clube do Tabuleiro')
    expect((await c.buscarTudo('CAFÉ coa')).rovers.length).toBeGreaterThan(0)
    expect((await c.buscarTudo('x')).rovers).toHaveLength(0)
    expect((await c.buscarTudo('<script>')).rovers).toHaveLength(0)
  })
  it('tipo=todos devolve até 5 de cada; com tipo, é paginado', async () => {
    const { c } = cliente()
    const t = await c.buscarTudo('a')
    expect(t.topicos.length).toBeLessThanOrEqual(5)
    const p1 = await c.buscarTipo('pipoca', 'topicos')
    expect(p1.itens.length).toBeGreaterThan(0)
    const todos = await c.buscarTipo('te', 'rovers')
    expect(todos.itens.length).toBeGreaterThan(0)
  })
  it('rover com listado falso não aparece na busca, nos recém-chegados nem nas sugestões', async () => {
    const { r } = como('lumi')
    r.rover(U('teco')).listado = false
    expect((await r.buscarTudo('teco')).rovers).toHaveLength(0)
    expect((await r.recemChegadosSociais()).map((x) => x.handle)).not.toContain('teco')
    expect((await r.sugestoes('rovers', ['plantas'])).map((x) => x.handle)).not.toContain('teco')
  })
  it('tópico escondido e apagado não aparecem na busca', async () => {
    const { r } = como('seixo')
    expect((await r.buscarTudo('3 curtidas')).topicos).toHaveLength(0)
    expect((await r.buscarTudo('pipoca')).topicos.length).toBeGreaterThan(0)
    r.executar(U('lumi'), { tipo: 'remocao-pelo-autor', alvo: TOPICOS.cinemaPipoca })
    expect((await r.buscarTudo('levemente')).topicos).toHaveLength(0)
  })
  it('em alta conta pessoas distintas: um rover que responde 50 vezes conta uma', async () => {
    const { r } = como('lumi')
    const t = r.criar(U('pipa'), 'topico', { comunidade: COMUNIDADES.cinema, categoria: null, titulo: 'Sozinha na conversa', texto: 'Só eu.', tags: [], enquete: [], enqueteDias: '3' })
    for (let i = 0; i < 50; i++) r.bdRespostas.set(`resp-${i}`, { id: `resp-${i}`, topico: t, autor: U('nina'), texto: `Sim ${i}`, em: r.now(), paiId: null, cita: null, reatores: new Map() })
    const lista = (await r.emAlta('topicos')).map((x) => x.id)
    // uma pessoa distinta vale 3 pontos (mínimo 2): entra, mas sem passar na frente do que tem mais gente
    expect(lista).toContain(t)
    expect(lista.indexOf(t)).toBeGreaterThan(0)
  })
  it('conta nova (menos de 1 dia) não pontua em alta', async () => {
    const { r } = como('lumi')
    r.rover(U('nina')).desde = r.now() - 3600_000
    r.rover(U('max')).desde = r.now() - 3600_000
    const t = r.criar(U('pipa'), 'topico', { comunidade: COMUNIDADES.cinema, categoria: null, titulo: 'Contas novas', texto: 'Teste.', tags: [], enquete: [], enqueteDias: '3' })
    r.criar(U('nina'), 'resposta-forum', { topico: t, em: null, cita: null, texto: 'a' })
    r.criar(U('max'), 'resposta-forum', { topico: t, em: null, cita: null, texto: 'b' })
    expect((await r.emAlta('topicos')).map((x) => x.id)).not.toContain(t)
  })
  it('tendência exige 3 autores distintos', async () => {
    const { c } = cliente()
    const tags = (await c.tendencias('7d')).map((t) => t.tag)
    expect(tags).toContain('pipoca')
    expect((await c.tendencias('7d')).every((t) => t.autores >= 3)).toBe(true)
    expect(tags).not.toContain('samambaia')
  })
  it('sugestão parte só do declarado e não repete o que a Lumi já participa', async () => {
    const { c } = cliente()
    const s = (await c.sugestoes('comunidades', ['foco'])).map((x) => x.nome)
    expect(s[0]).toBe('Cochilo da Tarde')
    expect(s).not.toContain('Cinema de Sofá')
    expect(s).not.toContain('Vitrola')
    const rs = (await c.sugestoes('rovers')).map((x) => x.handle)
    expect(rs).not.toContain('pipa')
    expect(rs).not.toContain('bento')
    expect(rs).not.toContain('lumi')
    expect((await c.sugestoes('paginas')).map((p) => p.id)).not.toContain(PAGINAS.nuvens)
  })
  it('recém-chegados: só os últimos 7 dias, do mais novo ao mais velho', async () => {
    const { c } = cliente()
    const r = await c.recemChegadosSociais()
    expect(r.map((x) => x.handle)[0]).toBe('nuvem')
    expect(r.map((x) => x.handle)).not.toContain('pipa')
    const ds = r.map((x) => x.desde)
    expect(ds).toEqual([...ds].sort().reverse())
  })
})

describe('reações e paginação', () => {
  it('reagir a tópico, resposta e atualização: tocar de novo tira, tocar em outra troca', async () => {
    const { c } = cliente()
    const id = RESPOSTAS.pipocaComFilhas
    const antes = (await c.respostas(TOPICOS.cinemaPipoca)).itens.find((x) => x.id === id)!.reacoes
    await c.reagir(id, 'curtir')
    const um = (await c.respostas(TOPICOS.cinemaPipoca)).itens.find((x) => x.id === id)!
    expect(um.minhaReacao).toBe('curtir')
    expect(um.reacoes.curtir).toBe(antes.curtir + 1)
    await c.reagir(id, 'util')
    expect((await c.respostas(TOPICOS.cinemaPipoca)).itens.find((x) => x.id === id)!.reacoes.curtir).toBe(antes.curtir)
    await c.reagir(id, 'util')
    expect((await c.respostas(TOPICOS.cinemaPipoca)).itens.find((x) => x.id === id)!.minhaReacao).toBeNull()
    const at = (await c.atualizacoes(PAGINAS.nuvens)).itens[0]
    await c.reagir(at.id, 'curtir')
    expect((await c.atualizacoes(PAGINAS.nuvens)).itens[0].minhaReacao).toBe('curtir')
    // fora da comunidade não se reage
    expect(await codigo(() => como('bolota').r.reagirSocial(U('bolota'), TOPICOS.cinemaPipoca, 'curtir'))).toBe('nao-e-membro')
    expect(await codigo(() => c.reagir(oid('naoexistemesmo'), 'curtir'))).toBe('nao-encontrado')
  })
  it('as listas paginam sem repetir e o cursor ruim é recusado', async () => {
    const { c } = cliente()
    const a = await c.recados(U('lumi'))
    expect(a.itens).toHaveLength(10)
    const b = await c.recados(U('lumi'), a.proximo)
    expect(b.itens.length).toBe(2)
    expect(b.proximo).toBeUndefined()
    expect(new Set([...a.itens, ...b.itens].map((x) => x.id)).size).toBe(12)
    expect(await codigo(() => c.recados(U('lumi'), '!!!'))).toBe('invalido')
    const cm = await c.comunidades()
    expect(cm.itens.length).toBeGreaterThan(0)
  })
  it('estado atual, relações e entregas (a Lumi sem nenhuma, a Pipa com duas)', async () => {
    const { c } = cliente()
    await c.agir({ tipo: 'estado', estado: 'dormindo' })
    expect((await c.paginaDoRover('lumi')).rover.estado?.estado).toBe('dormindo')
    // a folgali não mostra trabalho: a Lumi não tem entrega; o protocolo continua lendo as dos outros
    expect((await c.entregas(U('lumi'))).itens).toHaveLength(0)
    expect((await c.paginaDoRover('lumi')).contagens.entregas).toBe(0)
    expect((await c.entregas(U('pipa'))).itens).toHaveLength(2)
    expect((await c.paginaDoRover('pipa')).contagens.entregas).toBe(2)
  })
  it('apagar o próprio tópico some; o de outro não se apaga por este caminho', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.removerPeloAutor(TOPICOS.cinemaBoasVindas, U('lumi')))).toBe('sem-sermissao'.replace('sermissao', 'permissao'))
    await c.removerPeloAutor(TOPICOS.cinemaPipoca, U('lumi'))
    expect(await codigo(() => c.topico(TOPICOS.cinemaPipoca))).toBe('nao-encontrado')
  })
  it('o objeto de demonstração aponta para respostas que existem', async () => {
    const { c } = cliente()
    expect((await c.respostas(oid('tvitrolaagulha'))).itens.map((x) => x.id)).toContain(OBJETOS.respostaParaModerar)
  })
})

void Relogio

describe('rovers novos também respondem pelas rotas da fase 1', () => {
  it('obterRover, postagensDoRover e a página social concordam', async () => {
    const { c } = cliente()
    const j = await c.obterRover('juju')
    expect(j.handle).toBe('juju')
    expect(j.sintetico).toBe(true)
    expect((await c.postagensDoRover(j.uid)).itens).toEqual([])
    expect((await c.paginaDoRover('@juju')).rover.nome).toBe('Juju')
    expect(await codigo(() => c.obterRover('ninguem_mesmo'))).toBe('nao-encontrado')
  })
})
