import { describe, expect, it } from 'vitest'
import { COMUNIDADES, OBJETOS, PAGINAS, TOPICOS } from '@/lib/social/demo-ids'
import { oid } from '@/lib/demo-dados'
import { DIA, HORA, U, cliente, codigo, como, mensagem } from './ajuda-social'

describe('comunidade fechada: para quem está fora, não existe', () => {
  it('lê igual a uma comunidade que nunca existiu, em todas as rotas', async () => {
    const { r } = como('bolota')
    const inexistente = oid('naoexistemesmo')
    const fechada = COMUNIDADES.vitrola
    expect(await codigo(() => r.comunidade(fechada))).toBe('nao-encontrado')
    expect(await mensagem(() => r.comunidade(fechada))).toBe(await mensagem(() => r.comunidade(inexistente)))
    for (const f of [
      () => r.membros(fechada), () => r.topicos(fechada), () => r.registroDaComunidade(fechada), () => r.topico(TOPICOS.vitrolaLadoB),
      () => r.respostas(TOPICOS.vitrolaLadoB), () => r.historico(TOPICOS.vitrolaLadoB), () => r.pedidosDeEntrada(fechada), () => r.filaDeModeracao(fechada),
    ]) expect(await codigo(f)).toBe('nao-encontrado')
  })
  it('não aparece em lista, busca, em alta, tendência nem sugestão', async () => {
    const { r } = como('bolota')
    const nomes = (await r.comunidades()).itens.map((c) => c.nome)
    expect(nomes).not.toContain('Vitrola')
    expect(nomes).not.toContain('Jardim de Varanda')
    const b = await r.buscarTudo('tradutores')
    expect(b.comunidades).toHaveLength(0)
    expect((await r.buscarTudo('pastel plural')).topicos).toHaveLength(0)
    expect((await r.buscarTudo('samambaia')).topicos).toHaveLength(0)
    expect((await r.sugestoes('comunidades', ['idiomas', 'plantas'])).map((c) => c.id)).not.toContain(COMUNIDADES.vitrola)
  })
  it('atividade em fechada não vira "em alta" nem tendência', async () => {
    const { r } = como('ziza')
    // muita gente distinta respondendo e usando uma tag, só dentro da fechada
    const autores = ['fiapo', 'pipa', 'didi', 'mimi', 'ziza']
    for (const [i, a] of autores.entries()) r.criar(U(a), 'resposta-forum', { topico: TOPICOS.vitrolaLadoB, em: null, cita: null, texto: `Resposta ${i} #exclusivo` })
    const alta = (await r.emAlta('topicos', '7d')).map((t) => t.id)
    expect(alta).not.toContain(TOPICOS.vitrolaLadoB)
    expect((await r.emAlta('comunidades', '7d')).map((c) => c.id)).not.toContain(COMUNIDADES.vitrola)
    expect((await r.tendencias('7d')).map((t) => t.tag)).not.toContain('exclusivo')
  })
  it('o membro acha tópicos das suas fechadas na busca, nunca a comunidade em si', async () => {
    const { r } = como('fiapo')
    expect((await r.buscarTudo('curiosidade')).topicos.map((t) => t.id)).toContain(TOPICOS.vitrolaLadoB)
    expect((await r.buscarTudo('vitrola')).comunidades).toHaveLength(0)
  })
  it('quem sai deixa de ler, e a notificação para de apontar para o que já não pode ler', async () => {
    const { r } = como('pipa')
    const id = r.criar(U('ziza'), 'resposta-forum', { topico: TOPICOS.vitrolaLadoB, em: null, cita: null, texto: 'Isso vale para o @pipa também.' })
    const antes = (await r.notificacoes(U('pipa'))).itens.find((n) => n.tipo === 'mencao')
    expect(antes?.objeto).toBe(id)
    expect(antes?.nomeDoLugar).toBe('Vitrola')
    r.executar(U('pipa'), { tipo: 'comunidade-adesao', comunidade: COMUNIDADES.vitrola, acao: 'sair' })
    const depois = (await r.notificacoes(U('pipa'))).itens.find((n) => n.tipo === 'mencao')
    expect(depois?.objeto).toBeNull()
    expect(depois?.comunidade).toBeNull()
    expect(depois?.nomeDoLugar).toBeNull()
    expect(await codigo(() => r.topico(TOPICOS.vitrolaLadoB))).toBe('nao-encontrado')
  })
  it('o convidado lê só o cartão mínimo', async () => {
    const { c } = cliente()
    const x = await c.comunidade(COMUNIDADES.jardim)
    expect(Object.keys(x).sort()).toEqual(['acesso', 'descricao', 'id', 'nome', 'voce'])
    expect(x.voce?.convidado).toBe(true)
    expect(await codigo(() => c.topicos(COMUNIDADES.jardim))).toBe('nao-encontrado')
    expect(await codigo(() => c.membros(COMUNIDADES.jardim))).toBe('nao-encontrado')
  })
  it('denúncia de quem não podia ver o alvo é descartada, com a mesma resposta', async () => {
    const { r } = como('bolota')
    const antes = r.denuncias.length
    expect(await codigo(() => r.executar(U('bolota'), { tipo: 'denuncia', alvo: TOPICOS.vitrolaLadoB, motivo: 'spam' }))).toBe('ok')
    expect(r.denuncias.length).toBe(antes)
  })
})

describe('grafo fechado: amigos, comunidades, páginas e membros', () => {
  it('a lista é do próprio e a aresta só aparece se todas as pontas são públicas', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.amigos(U('didi')))).toBe('grafo-privado')
    expect(await codigo(() => c.comunidadesDoRover(U('didi')))).toBe('grafo-privado')
    expect(await codigo(() => c.paginasDoRover(U('didi')))).toBe('grafo-privado')
    const amigosDoMax = (await c.amigos(U('max'))).itens.map((a) => a.rover.handle)
    expect(amigosDoMax).not.toContain('didi')
    const pg = await c.paginaDoRover('didi')
    expect(pg.contagens.amigos).toBeNull()
    expect(pg.contagens.comunidades).toBeNull()
  })
  it('contagem de amigos dos outros ignora quem fechou o grafo, e o próprio vê todos', async () => {
    const { c } = cliente()
    const max = await c.paginaDoRover('max')
    expect(max.contagens.amigos).toBe((await c.amigos(U('max'))).itens.length)
    const { r } = como('max')
    expect((await r.amigos(U('max'))).itens.map((a) => a.rover.handle)).toContain('didi')
  })
  it('quem fechou o grafo some da lista de membros, menos para a moderação', async () => {
    const naoMod = await como('juju').r.membros(COMUNIDADES.cochilo)
    expect(naoMod.itens.map((m) => m.rover.handle)).not.toContain('didi')
    const mod = await como('bolota').r.membros(COMUNIDADES.cochilo)
    expect(mod.itens.map((m) => m.rover.handle)).toContain('didi')
    // o contador do cartão conta todos
    expect(((await como('juju').r.comunidade(COMUNIDADES.cochilo)) as { membros: number }).membros).toBeGreaterThan(naoMod.itens.length)
  })
  it('amigos em comum só entre grafos públicos', async () => {
    const { c } = cliente()
    expect((await c.amigosEmComum(U('pipa'), U('lumi'))).itens.map((x) => x.handle).sort()).toEqual(['max', 'nina'])
    expect(await codigo(() => c.amigosEmComum(U('didi'), U('pipa')))).toBe('grafo-privado')
    expect(await codigo(() => c.amigosEmComum(U('pipa'), U('pipa')))).toBe('invalido')
  })
})

describe('depoimento: só aparece depois do aceite', () => {
  it('o pendente não está na lista pública, nem na contagem, e só o dono lê a fila', async () => {
    const { c } = cliente()
    const aceitos = (await c.depoimentos(U('lumi'))).itens
    expect(aceitos.map((d) => d.id)).not.toContain(OBJETOS.depoimentoPendente)
    expect(aceitos.every((d) => d.estado === 'aceito')).toBe(true)
    expect((await c.paginaDoRover('lumi')).contagens.depoimentos).toBe(aceitos.length)
    const pend = (await c.depoimentos(U('lumi'), { estado: 'pendentes' })).itens
    expect(pend.map((d) => d.id).sort()).toEqual([OBJETOS.depoimentoPendente, OBJETOS.depoimentoPendente2].sort())
    const { r } = como('pipa')
    expect(await codigo(() => r.depoimentos(U('lumi'), { estado: 'pendentes' }))).toBe('sem-permissao')
    expect((await r.depoimentos(U('lumi'))).itens.map((d) => d.id)).not.toContain(OBJETOS.depoimentoPendente)
  })
  it('aceitar publica e avisa o autor; recusar esconde e não volta', async () => {
    const { c } = cliente()
    expect((await c.agir({ tipo: 'depoimento-decisao', depoimento: OBJETOS.depoimentoPendente, decisao: 'aceitar' })).resultado).toBe('aceito')
    expect((await c.depoimentos(U('lumi'))).itens.map((d) => d.id)).toContain(OBJETOS.depoimentoPendente)
    expect(await codigo(() => c.agir({ tipo: 'depoimento-decisao', depoimento: OBJETOS.depoimentoPendente, decisao: 'aceitar' }))).toBe('ja-existe')
    expect((await c.agir({ tipo: 'depoimento-decisao', depoimento: OBJETOS.depoimentoPendente, decisao: 'recusar' })).resultado).toBe('recusado')
    expect((await c.depoimentos(U('lumi'))).itens.map((d) => d.id)).not.toContain(OBJETOS.depoimentoPendente)
    expect(await codigo(() => c.agir({ tipo: 'depoimento-decisao', depoimento: OBJETOS.depoimentoPendente, decisao: 'aceitar' }))).toBe('ja-existe')
  })
  it('só o dono decide', async () => {
    const { r } = como('pipa')
    expect(await codigo(() => r.executar(U('pipa'), { tipo: 'depoimento-decisao', depoimento: OBJETOS.depoimentoPendente, decisao: 'aceitar' }))).toBe('sem-permissao')
  })
  it('amigo novo não escreve; um vivo por par; recusado espera 7 dias', async () => {
    const rel = (await import('./ajuda-social')).Relogio
    const t = new rel()
    const { r } = como('teco', t)
    expect(await codigo(() => r.criar(U('teco'), 'depoimento', { alvo: U('lumi'), texto: 'Muito bom.' }))).toBe('conta-nova')
    const { r: r2 } = como('nina', t)
    expect(await codigo(() => r2.criar(U('nina'), 'depoimento', { alvo: U('lumi'), texto: 'Outro.' }))).toBe('ja-existe')
    const { r: r3 } = como('pipa', t)
    r3.executar(U('pipa'), { tipo: 'amizade', alvo: U('lumi'), acao: 'desfazer' })
    r3.executar(U('pipa'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' })
    expect(await codigo(() => r3.criar(U('pipa'), 'depoimento', { alvo: U('lumi'), texto: 'Voltei.' }))).toBe('sem-permissao')
  })
})

describe('selos: contagem de doadores distintos que ainda são amigos', () => {
  it('repetido, de não-amigo e de amigo novo não valem', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' }))).toBe('ok')
    expect(await codigo(() => c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' }))).toBe('ja-existe')
    expect(await codigo(() => c.agir({ tipo: 'selo', alvo: U('nuvem'), selo: 'rapido' }))).toBe('sem-permissao')
    expect(await codigo(() => c.agir({ tipo: 'selo', alvo: U('tuca'), selo: 'rapido' }))).toBe('conta-nova')
    expect(await codigo(() => como('teco').r.executar(U('teco'), { tipo: 'selo', alvo: U('lumi'), selo: 'divertido' }))).toBe('conta-nova')
  })
  it('dar o mesmo selo duas vezes por caminhos diferentes conta um doador', async () => {
    const { r } = como('lumi')
    const antes = (await r.paginaDoRover(U('pipa'))).selos.confiavel
    r.executar(U('lumi'), { tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' })
    expect((await r.paginaDoRover(U('pipa'))).selos.confiavel).toBe(antes + 1)
  })
  it('quem desfaz a amizade ou é bloqueado deixa de contar', async () => {
    const { c } = cliente()
    expect((await c.paginaDoRover('lumi')).selos.caprichoso).toBe(1)
    await c.agir({ tipo: 'amizade', alvo: U('pipa'), acao: 'desfazer' })
    expect((await c.paginaDoRover('lumi')).selos.caprichoso).toBe(0)
    const { c: c2 } = cliente()
    await c2.agir({ tipo: 'relacao', alvo: U('nina'), acao: 'bloquear' })
    const s = (await c2.paginaDoRover('lumi')).selos
    expect(s.confiavel).toBe(0)
    expect(s.divertido).toBe(0)
  })
  it('a notificação de selo não diz quem deu', async () => {
    const { r } = como('pipa')
    r.executar(U('pipa'), { tipo: 'selo', alvo: U('nina'), selo: 'divertido' })
    const { r: rn } = como('nina')
    rn.executar(U('pipa'), { tipo: 'selo', alvo: U('nina'), selo: 'rapido' })
    const n = (await rn.notificacoes(U('nina'))).itens.find((x) => x.tipo === 'selo-recebido')
    expect(n?.origem).toBeNull()
  })
})

describe('recado, bloqueio e silêncio', () => {
  it('bloqueio, "só amigos" e "ninguém" dão a MESMA resposta', async () => {
    const { r } = como('bento')
    const bloq = await mensagem(() => r.criar(U('bento'), 'recado', { alvo: U('lumi'), texto: 'Oi!' }))
    const { r: rt } = como('lumi')
    const lado = await mensagem(() => rt.criar(U('lumi'), 'recado', { alvo: U('bento'), texto: 'Oi!' }))
    const ninguem = await mensagem(() => rt.criar(U('lumi'), 'recado', { alvo: U('biscoito'), texto: 'Oi!' }))
    const soAmigos = await mensagem(() => como('lola').r.criar(U('lola'), 'recado', { alvo: U('nina'), texto: 'Oi!' }))
    expect(new Set([bloq, lado, ninguem, soAmigos]).size).toBe(1)
    expect(await codigo(() => r.criar(U('bento'), 'recado', { alvo: U('lumi'), texto: 'Oi!' }))).toBe('interacao-nao-permitida')
  })
  it('amigo escreve em perfil "só amigos"; ninguém escreve no próprio mural; limite de 3 por dia por par', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.criar(U('lumi'), 'recado', { alvo: U('nina'), texto: 'Oi, Nina.' }))).toBe('ok')
    expect(await codigo(() => r.criar(U('lumi'), 'recado', { alvo: U('lumi'), texto: 'Oi, eu.' }))).toBe('sem-permissao')
    for (const t of ['Dois.', 'Três.']) await r.criar(U('lumi'), 'recado', { alvo: U('nina'), texto: t })
    expect(await codigo(() => r.criar(U('lumi'), 'recado', { alvo: U('nina'), texto: 'Quatro.' }))).toBe('limite')
  })
  it('o dono apaga qualquer recado do mural; os outros não; o autor apaga o seu', async () => {
    const { c } = cliente()
    const rec = (await c.recados(U('lumi'))).itens[0]
    expect(await codigo(() => como('max').r.executar(U('max'), { tipo: 'remocao-por-responsavel', alvo: rec.id, motivo: 'spam' }))).toBe('sem-permissao')
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: rec.id, motivo: 'spam' })
    expect((await c.recados(U('lumi'))).itens.map((x) => x.id)).not.toContain(rec.id)
    await c.removerPeloAutor(OBJETOS.recadoDaLumi, U('lumi'))
    expect((await c.recados(U('pipa'))).itens.map((x) => x.id)).not.toContain(OBJETOS.recadoDaLumi)
    expect(await codigo(() => c.removerPeloAutor(OBJETOS.recadoDaLumi, U('lumi')))).toBe('nao-encontrado')
  })
  it('recado e depoimento de quem foi bloqueado somem do mural de quem bloqueou', async () => {
    const { c } = cliente()
    const total = async () => (await c.paginaDoRover('lumi')).contagens.recados
    const antes = await total()
    expect((await c.recados(U('lumi'))).itens.some((x) => x.autor.handle === 'seixo')).toBe(true)
    await c.agir({ tipo: 'relacao', alvo: U('seixo'), acao: 'bloquear' })
    expect(await total()).toBe(antes - 2)
    for (let cursor: string | undefined, i = 0; i < 5; i++) {
      const p = await c.recados(U('lumi'), cursor)
      expect(p.itens.some((x) => x.autor.handle === 'seixo')).toBe(false)
      cursor = p.proximo
      if (!cursor) break
    }
  })
  it('silenciar só corta o aviso; bloquear desfaz amizade, pedidos e seguir', async () => {
    const { c } = cliente()
    await c.agir({ tipo: 'relacao', alvo: U('pipa'), acao: 'silenciar' })
    const antes = await c.contagemDeNotificacoes(U('lumi'))
    como('pipa').r.executar(U('pipa'), { tipo: 'amizade', alvo: U('lumi'), acao: 'desfazer' })
    expect(await c.contagemDeNotificacoes(U('lumi'))).toBe(antes)
    const v = (await c.paginaDoRover('pipa')).voce
    expect(v?.euSilenciei).toBe(true)
    expect(v?.amigo).toBe(true)
    await c.agir({ tipo: 'relacao', alvo: U('pipa'), acao: 'bloquear' })
    const b = (await c.paginaDoRover('pipa')).voce
    expect(b?.amigo).toBe(false)
    expect(b?.euBloqueei).toBe(true)
    expect((await c.obterRover('pipa')).euSigo).toBe(false)
    expect(await codigo(() => c.agir({ tipo: 'relacao', alvo: U('pipa'), acao: 'bloquear' }))).toBe('ja-existe')
  })
})

describe('amizade', () => {
  it('pedir, aceitar, recusar com prazo, desfazer e pedido cruzado', async () => {
    const rel = new (await import('./ajuda-social')).Relogio()
    const { c } = cliente(rel)
    // o Zeca já pediu: pedir de volta vira amizade na hora
    expect((await c.agir({ tipo: 'amizade', alvo: U('zeca'), acao: 'pedir' })).resultado).toBe('ativa')
    // a Lola recebeu o pedido da Lumi: cancelar e pedir de novo
    expect((await c.agir({ tipo: 'amizade', alvo: U('lola'), acao: 'desfazer' })).resultado).toBe('nenhuma')
    expect((await c.agir({ tipo: 'amizade', alvo: U('lola'), acao: 'pedir' })).resultado).toBe('pendente')
    expect(await codigo(() => c.agir({ tipo: 'amizade', alvo: U('lola'), acao: 'pedir' }))).toBe('ja-existe')
    expect(await codigo(() => c.agir({ tipo: 'amizade', alvo: U('pipa'), acao: 'pedir' }))).toBe('ja-existe')
    expect(await codigo(() => c.agir({ tipo: 'amizade', alvo: U('nuvem'), acao: 'aceitar' }))).toBe('nao-encontrado')
    // recusa: 7 dias sem poder pedir de novo
    const { r } = como('lumi', rel)
    expect(r.executar(U('lumi'), { tipo: 'amizade', alvo: U('zeca'), acao: 'recusar' }).resultado).toBe('nenhuma')
    expect(await codigo(() => r.executar(U('zeca'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' }))).toBe('limite')
    rel.avancar(8 * DIA)
    expect(r.executar(U('zeca'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' }).resultado).toBe('pendente')
  })
  it('pedido de/para quem bloqueou dá a mesma resposta', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.agir({ tipo: 'amizade', alvo: U('bento'), acao: 'pedir' }))).toBe('interacao-nao-permitida')
    const { r } = como('bento')
    expect(await codigo(() => r.executar(U('bento'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' }))).toBe('interacao-nao-permitida')
  })
})

describe('perfil e páginas de projeto', () => {
  it('a página do rover junta tudo e `voce` só diz o que é do leitor', async () => {
    const { c } = cliente()
    const p = await c.paginaDoRover('pipa')
    expect(p.voce).toMatchObject({ amigo: true, euBloqueei: false, papel: null })
    expect(p.rover.sabeFazer.length).toBeGreaterThan(0)
    expect(p.rover.estado?.estado).toBeTruthy()
    const eu = await c.paginaDoRover('lumi')
    expect(eu.voce?.papel).toBe('proprio')
    expect(await codigo(() => c.paginaDoRover('ninguem_aqui'))).toBe('nao-encontrado')
  })
  it('dono de página gerencia administradores; admin publica; só o dono remove atualização alheia', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.agir({ tipo: 'pagina-gestao', pagina: PAGINAS.cafe, alvo: U('pipa'), acao: 'adicionar-admin' }))).toBe('sem-permissao')
    await c.agir({ tipo: 'pagina-gestao', pagina: PAGINAS.disco, alvo: U('pipa'), acao: 'adicionar-admin' })
    expect((await c.pagina(PAGINAS.disco)).administradores.map((a) => a.handle)).toContain('pipa')
    expect(await codigo(() => c.agir({ tipo: 'pagina-gestao', pagina: PAGINAS.disco, alvo: U('lumi'), acao: 'remover-admin' }))).toBe('invalido')
    const at = (await c.atualizacoes(PAGINAS.disco)).itens.find((a) => a.autor.handle === 'fiapo')!
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: at.id, motivo: 'fora-do-tema' })
    expect((await c.atualizacoes(PAGINAS.disco)).itens.map((a) => a.id)).not.toContain(at.id)
    expect((await c.registroDaComunidade(COMUNIDADES.cinema)).itens.length).toBeGreaterThan(0)
    // um admin que não é dono não remove atualização de outro
    const { r } = como('tuca')
    const dela = (await r.atualizacoes(PAGINAS.cafe)).itens.find((a) => a.autor.handle === 'tuca')!
    expect(await codigo(() => como('lumi').r.executar(U('lumi'), { tipo: 'remocao-por-responsavel', alvo: dela.id, motivo: 'spam' }))).toBe('sem-permissao')
  })
  it('seguir e deixar de seguir página; a contagem só inclui quem mantém o grafo público', async () => {
    const { c } = cliente()
    const antes = (await c.pagina(PAGINAS.marshmallow)).seguidores
    await c.agir({ tipo: 'pagina-seguir', pagina: PAGINAS.marshmallow, acao: 'seguir' })
    expect((await c.pagina(PAGINAS.marshmallow)).seguidores).toBe(antes + 1)
    expect(await codigo(() => c.agir({ tipo: 'pagina-seguir', pagina: PAGINAS.marshmallow, acao: 'seguir' }))).toBe('ja-existe')
    await c.agir({ tipo: 'pagina-seguir', pagina: PAGINAS.marshmallow, acao: 'deixar' })
    expect(await codigo(() => c.agir({ tipo: 'pagina-seguir', pagina: PAGINAS.marshmallow, acao: 'deixar' }))).toBe('nao-encontrado')
  })
  it('a linha mista traz a atualização da página que a Lumi segue e não a da que ele não segue', async () => {
    const { c } = cliente()
    const todos: string[] = []
    let cursor: string | undefined
    do {
      const p = await c.linhaMista(cursor)
      for (const i of p.itens) if (i.tipo === 'atualizacao') todos.push(i.atualizacao.pagina)
      cursor = p.proximo
    } while (cursor)
    expect(todos).toContain(PAGINAS.nuvens)
    expect(todos).not.toContain(PAGINAS.marshmallow)
  })
})

void HORA
